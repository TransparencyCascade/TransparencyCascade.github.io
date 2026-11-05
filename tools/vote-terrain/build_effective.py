"""Effective vote for the vote-terrain page: residents, eligible citizens and electoral votes behind each
county's votes, and the exact three-part decomposition of a vote's electoral weight.

    /usr/bin/python3 -I build_effective.py <downloads dir> <elections.json> <balance.json> <out effective.json>

Missing downloads are fetched into the downloads directory (www2.census.gov bulk files; api.census.gov
needs a key). Every figure is read from a downloaded file or from elections.json / balance.json; nothing is
typed in.

Measures, for county f in state s and an election with county votes:
  electoral votes behind the county  evc_f = EV_s * pop_f / pop_s
  weight per vote                     w_f   = evc_f / votes_f
  national average                    A     = E / V, with E = sum evc_f and V = sum votes_f over counties
                                              with votes in that election
  ratio                               w_f / A = B_s * N_f * T_f, exactly, where
    B_s = (EV_s / pop_s) / (E / P)            electoral votes per resident in the state, vs national
    N_f = (pop_f / CVAP_f) / (P / C)          residents per eligible citizen, vs national
    T_f = (CVAP_f / votes_f) / (C / V)        eligible citizens per vote cast, vs national
  P, C sum over the same counties. Population is the decennial count (2010 Census for elections through
  2020, 2020 Census from 2022); CVAP is the ACS special tabulation (2014-2018 for elections through 2020,
  2019-2023 from 2022); EV are the allocations National Archives lists (balance.json), 2010 Census basis for
  2016/2020 and 2020 Census basis from 2022.
"""

import csv
import io
import json
import math
import os
import sys
import urllib.request
import zipfile
from collections import defaultdict

D_DIR, ELECTIONS, BALANCE, OUT = sys.argv[1:5]

CENSUS = "https://www2.census.gov"
PL20 = f"{CENSUS}/programs-surveys/decennial/2020/data/01-Redistricting_File--PL_94-171"
URL = {
    "co-est2020-alldata.csv": f"{CENSUS}/programs-surveys/popest/datasets/2010-2020/counties/totals/co-est2020-alldata.csv",
    "CVAP_2014-2018_ACS_csv_files.zip": f"{CENSUS}/programs-surveys/decennial/rdo/datasets/2018/2018-cvap/CVAP_2014-2018_ACS_csv_files.zip",
    "CVAP_2019-2023_ACS_csv_files.zip": f"{CENSUS}/programs-surveys/decennial/rdo/datasets/2023/2023-cvap/CVAP_2019-2023_ACS_csv_files.zip",
    "co-est00int-tot.csv": f"{CENSUS}/programs-surveys/popest/datasets/2000-2010/intercensal/county/co-est00int-tot.csv",
    "us2020.npl.zip": f"{PL20}/National/us2020.npl.zip",
    "us2010.npl.zip": f"{CENSUS}/programs-surveys/decennial/2010/data/01-Redistricting_File--PL_94-171/National/us2010.npl.zip",
    "apportionment.csv": f"{CENSUS}/programs-surveys/decennial/2020/data/apportionment/apportionment.csv",
}
SOURCES = [
    {"what": "2010 Census county population (CENSUS2010POP, the April 1, 2010 count)", "url": URL["co-est2020-alldata.csv"]},
    {"what": "2010 Census population of Bedford city VA (merged into Bedford County in 2013), 2000-2010 intercensal file", "url": URL["co-est00int-tot.csv"]},
    {"what": "2020 Census county population and population 18+ (P1, P3), Redistricting Data PL 94-171, state files", "url": f"{PL20}/"},
    {"what": "2020 and 2010 Census national and state totals, PL 94-171 national files", "url": URL["us2020.npl.zip"]},
    {"what": "2010 Census national total, PL 94-171 national file", "url": URL["us2010.npl.zip"]},
    {"what": "Citizen voting-age population by county, ACS 2014-2018 special tabulation", "url": URL["CVAP_2014-2018_ACS_csv_files.zip"]},
    {"what": "Citizen voting-age population by county, ACS 2019-2023 special tabulation", "url": URL["CVAP_2019-2023_ACS_csv_files.zip"]},
    {"what": "House apportionment by state, 1910-2020 (seats, cross-check of electoral votes)", "url": URL["apportionment.csv"]},
    {"what": "Electoral votes by state, National Archives (via balance.json)", "url": "https://www.archives.gov/electoral-college/allocation"},
    {"what": "County votes (via elections.json)", "url": "https://doi.org/10.7910/DVN/VOQCHQ"},
]

FIPS_ST = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC",
    "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
    "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT",
    "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
    "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
    "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY",
}
ST_NAME = {}  # filled from apportionment.csv names via balance.json stateNames
# County codes folded to the codes elections.json uses (see its notes): Shannon County SD was renamed
# Oglala Lakota (46113 -> 46102); Falls Church city is added to Fairfax County, Bedford city to Bedford
# County (already merged in the Census files).
FOLD = {"46113": "46102", "51610": "51059", "51515": "51019"}


def path(name):
    p = os.path.join(D_DIR, name)
    if not os.path.exists(p):
        print("fetch", URL[name], file=sys.stderr)
        urllib.request.urlretrieve(URL[name], p)
    return p


def fold(f):
    return FOLD.get(f, f)


# ---- 2010 Census county population ----
pop10, st_pop10_file, seen10 = defaultdict(int), {}, set()
with open(path("co-est2020-alldata.csv"), encoding="latin-1") as fh:
    for r in csv.DictReader(fh):
        f = r["STATE"] + r["COUNTY"]
        seen10.add(f)
        if r["SUMLEV"] == "050" and r["CENSUS2010POP"] != "X":  # X: Alaska areas created after 2010
            pop10[fold(f)] += int(r["CENSUS2010POP"])
        elif r["SUMLEV"] == "040":
            st_pop10_file[r["STATE"]] = int(r["CENSUS2010POP"])

# counties dissolved after 2010 (Bedford city VA) are missing from the 2010-2020 file; take their 2010
# count from the 2000-2010 intercensal file (Alaska is not used)
with open(path("co-est00int-tot.csv"), encoding="latin-1") as fh:
    for r in csv.DictReader(fh):
        f = r["STATE"].zfill(2) + r["COUNTY"].zfill(3)
        if r["SUMLEV"] == "50" and f == "51515":  # 46113 is the renamed 46102, already counted
            pop10[fold(f)] += int(r["CENSUS2010POP"])

# ---- 2020 Census county population and 18+ (PL 94-171 state files, county rows only) ----
pl_dir = os.path.join(D_DIR, "pl")
os.makedirs(pl_dir, exist_ok=True)


def pl_state(ab, folder):
    """County rows of one state's PL file, cached as <ab>.geo / .f1 / .f2 (logrecno|value)."""
    if not os.path.exists(os.path.join(pl_dir, ab + ".f2")):
        z = os.path.join(pl_dir, f"{ab}2020.pl.zip")
        print("fetch", f"{PL20}/{folder}/{ab}2020.pl.zip", file=sys.stderr)
        urllib.request.urlretrieve(f"{PL20}/{folder}/{ab}2020.pl.zip", z)
        with zipfile.ZipFile(z) as zf:
            geo = [l.split("|") for l in zf.read(f"{ab}geo2020.pl").decode("latin-1").splitlines()]
            open(os.path.join(pl_dir, ab + ".geo"), "w").write(
                "".join(f"{g[7]}|{g[9]}|{g[14]}\n" for g in geo if g[2] == "050"))
            for seg, ext in (("00001", "f1"), ("00002", "f2")):
                rows = [l.split("|") for l in zf.read(f"{ab}{seg}2020.pl").decode("latin-1").splitlines()]
                open(os.path.join(pl_dir, f"{ab}.{ext}"), "w").write("".join(f"{x[4]}|{x[5]}\n" for x in rows))
        os.remove(z)
    read = lambda ext: dict(l.strip().split("|")[:2] for l in open(os.path.join(pl_dir, f"{ab}.{ext}")))
    geo = [l.strip().split("|") for l in open(os.path.join(pl_dir, ab + ".geo"))]
    f1, f2 = read("f1"), read("f2")
    return {g[1]: (int(f1[g[0]]), int(f2[g[0]])) for g in geo}


FOLDERS = {
    "AL": "Alabama", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado", "CT": "Connecticut",
    "DE": "Delaware", "DC": "District_of_Columbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana",
    "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New_Hampshire", "NJ": "New_Jersey", "NM": "New_Mexico", "NY": "New_York", "NC": "North_Carolina",
    "ND": "North_Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania",
    "RI": "Rhode_Island", "SC": "South_Carolina", "SD": "South_Dakota", "TN": "Tennessee", "TX": "Texas",
    "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West_Virginia",
    "WI": "Wisconsin", "WY": "Wyoming",
}
pop20, adu20 = defaultdict(int), defaultdict(int)
for ab, folder in FOLDERS.items():
    for f, (p, a) in pl_state(ab.lower(), folder).items():
        pop20[fold(f)] += p
        adu20[fold(f)] += a

# national files: US and state totals, for the checks
with zipfile.ZipFile(path("us2020.npl.zip")) as zf:
    geo = [l.split("|") for l in zf.read("usgeo2020.npl").decode("latin-1").splitlines()]
    seg = {l.split("|")[4]: l.split("|") for l in zf.read("us000012020.npl").decode("latin-1").splitlines()}
nat20 = {"US" if g[2] == "010" else g[12]: int(seg[g[7]][5]) for g in geo if g[2] in ("010", "040") and g[4] == "00"}
with zipfile.ZipFile(path("us2010.npl.zip")) as zf:
    seg = [l.split(",") for l in zf.read("us000012010.npl").decode("latin-1").splitlines()]
nat10_us = int(next(x for x in seg if x[4] == "0000001")[5])

# ---- CVAP ----


def cvap(name):
    out = {}
    with zipfile.ZipFile(path(name)) as zf:
        rows = csv.DictReader(io.TextIOWrapper(zf.open("County.csv"), encoding="latin-1"))
        for r in rows:
            r = {k.lower(): v for k, v in r.items()}
            if r["lntitle"] == "Total":
                out[r["geoid"][-5:]] = int(r["cvap_est"])
    return out


cv18 = defaultdict(int)
for f, v in cvap("CVAP_2014-2018_ACS_csv_files.zip").items():
    cv18[fold(f)] += v
cv23_raw = cvap("CVAP_2019-2023_ACS_csv_files.zip")
cv23 = defaultdict(int)
for f, v in cv23_raw.items():
    if not f.startswith("09"):
        cv23[fold(f)] += v
# Connecticut: the 2019-2023 tabulation uses the nine planning regions (09110-09190), which do not nest in
# the eight historic counties the vote data uses. The state CVAP is shared among the historic counties in
# proportion to their 2020 Census population 18+.
ct_cvap = sum(v for f, v in cv23_raw.items() if f.startswith("09"))
ct_adu = sum(a for f, a in adu20.items() if f.startswith("09"))
for f, a in adu20.items():
    if f.startswith("09"):
        cv23[f] = round(ct_cvap * a / ct_adu)

# ---- electoral votes and seats ----
bal = json.load(open(BALANCE))
EV10, EV20 = bal["ev"]["pres2016"], bal["ev"]["pres2024"]
for y, ev in (("2010", EV10), ("2020", EV20)):
    assert ev == bal["ev"]["pres2020" if y == "2010" else "pres2024"]
name_ab = {v: k for k, v in bal["stateNames"].items()}
seats = {"2010": {}, "2020": {}}
with open(path("apportionment.csv"), encoding="utf-8-sig") as fh:
    for r in csv.DictReader(fh):
        if r["Geography Type"] == "State" and r["Year"] in seats and r["Name"] in name_ab:
            n = r["Number of Representatives"].replace(",", "")
            seats[r["Year"]][name_ab[r["Name"]]] = int(n) if n else 0
checks = {"seats_plus_two_equals_ev": {}}
for y, ev in (("2010", EV10), ("2020", EV20)):
    bad = {s: (seats[y].get(s), e) for s, e in ev.items() if s != "DC" and seats[y].get(s, -9) + 2 != e}
    checks["seats_plus_two_equals_ev"][y] = "all states" if not bad else bad
    assert not bad, bad

# ---- votes ----
el = json.load(open(ELECTIONS))
counties = sorted(set(pop10) | set(pop20))
vote_fips = set()
for e in el["elections"].values():
    vote_fips |= set(e["data"])
missing = sorted(f for f in vote_fips if f not in pop20 or f not in pop10)
assert not missing, f"vote counties without population: {missing[:20]}"

st_of = lambda f: FIPS_ST[f[:2]]
st_pop = {"2010": defaultdict(int), "2020": defaultdict(int)}
st_cvap = {"2010": defaultdict(int), "2020": defaultdict(int)}
for f in counties:
    st_pop["2010"][st_of(f)] += pop10.get(f, 0)
    st_pop["2020"][st_of(f)] += pop20.get(f, 0)
    st_cvap["2010"][st_of(f)] += cv18.get(f, 0)
    st_cvap["2020"][st_of(f)] += cv23.get(f, 0)

# population checks against the Census national and state totals
checks["population"] = {
    "2010_counties_sum_excl_AK": sum(v for f, v in pop10.items() if not f.startswith("02")),
    "2010_census_us_total": nat10_us, "2010_census_AK": st_pop10_file["02"],
    "2010_counties_plus_AK": sum(v for f, v in pop10.items() if not f.startswith("02")) + st_pop10_file["02"],
    "2020_counties_sum_excl_AK": sum(pop20.values()),
    "2020_census_us_total": nat20["US"], "2020_census_AK": nat20["02"],
    "2020_counties_plus_AK": sum(pop20.values()) + nat20["02"],
}
assert checks["population"]["2010_counties_plus_AK"] == nat10_us
assert checks["population"]["2020_counties_plus_AK"] == nat20["US"]
st_bad = {s: (st_pop["2020"][s], nat20[k]) for k, s in FIPS_ST.items() if s != "AK" and st_pop["2020"][s] != nat20[k]}
st_bad10 = {s: (st_pop["2010"][s], st_pop10_file[k]) for k, s in FIPS_ST.items() if s != "AK" and st_pop["2010"][s] != st_pop10_file[k]}
assert not st_bad and not st_bad10, (st_bad, st_bad10)
checks["population"]["state_sums_match_state_totals"] = True

# ---- Alaska: no county votes in the page; certified statewide totals from balance.json ----
# Alaska reports by House district, not by county. Where balance.json holds its statewide total for an election
# (president 2016-2024, Senate 2020, 2022 and 2026), Alaska enters the state rows and the national totals as one
# unit: its census population, its citizen voting-age population (the sum of its county-equivalent rows in the
# ACS special tabulation) and its electoral votes. Governor races have no Alaska total, so Alaska stays out.
AK_TOT = bal.get("noCounty", {}).get("AK", {})
AK_POP = {"2010": st_pop10_file["02"], "2020": nat20["02"]}
AK_CV = {"2010": sum(v for f, v in cv18.items() if f.startswith("02")),
         "2020": sum(v for f, v in cv23_raw.items() if f.startswith("02"))}
assert all(AK_CV.values()), AK_CV

# ---- per election ----
BASIS = lambda e: "2010" if int(e["year"]) <= 2020 else "2020"
POP = {"2010": pop10, "2020": pop20}
CV = {"2010": cv18, "2020": cv23}
EVB = {"2010": EV10, "2020": EV20}
CVAP_LABEL = {"2010": "ACS 2014-2018", "2020": "ACS 2019-2023"}
out_el, worst = {}, 0.0
extremes = {}
for key, e in el["elections"].items():
    if e.get("baselineOnly"):  # mixed-year comparison tracks, never shown as a map of their own
        continue
    b = BASIS(e)
    pop, cv, EV = POP[b], CV[b], EVB[b]
    rows = [(f, v[0]) for f, v in e["data"].items() if v[0] > 0]
    sts = {st_of(f) for f, _ in rows}
    evc = {f: EV[st_of(f)] * pop[f] / st_pop[b][st_of(f)] for f, _ in rows}
    ak = AK_TOT.get(key)
    E = sum(evc.values()) + (EV["AK"] if ak else 0)
    V = sum(v for _, v in rows) + (ak["votes"] if ak else 0)
    P = sum(pop[f] for f, _ in rows) + (AK_POP[b] if ak else 0)
    C = sum(cv[f] for f, _ in rows) + (AK_CV[b] if ak else 0)
    A = E / V
    per = []
    for f, votes in rows:
        s = st_of(f)
        r = evc[f] / votes / A
        B = (EV[s] / st_pop[b][s]) / (E / P)
        N = (pop[f] / cv[f]) / (P / C)
        T = (cv[f] / votes) / (C / V)
        worst = max(worst, abs(B * N * T / r - 1))
        per.append((r, f, B, N, T, votes))
    # state rows: same decomposition on state totals (votes from the counties with data)
    svotes, scv, spop = defaultdict(int), defaultdict(int), defaultdict(int)
    for f, votes in rows:
        svotes[st_of(f)] += votes
        scv[st_of(f)] += cv[f]
        spop[st_of(f)] += pop[f]
    states = {}
    for s in sorted(sts):
        r = (EV[s] * spop[s] / st_pop[b][s]) / svotes[s] / A
        B = (EV[s] / st_pop[b][s]) / (E / P)
        N = (spop[s] / scv[s]) / (P / C)
        T = (scv[s] / svotes[s]) / (C / V)
        worst = max(worst, abs(B * N * T / r - 1))
        states[s] = [round(r, 4), round(B, 4), round(N, 4), round(T, 4)]
    if ak:   # Alaska as one unit, from its statewide total
        r = EV["AK"] / ak["votes"] / A
        B = (EV["AK"] / AK_POP[b]) / (E / P)
        N = (AK_POP[b] / AK_CV[b]) / (P / C)
        T = (AK_CV[b] / ak["votes"]) / (C / V)
        worst = max(worst, abs(B * N * T / r - 1))
        states["AK"] = [round(r, 4), round(B, 4), round(N, 4), round(T, 4)]
    out_el[key] = {
        "basis": b, "cvap": CVAP_LABEL[b], "E": round(E, 3), "V": V, "P": P, "C": C,
        "A": A, "Nnat": P / C, "Tnat": C / V, "states": states,
        **({"stateOnly": {"AK": {"votes": ak["votes"], "D": ak["D"], "R": ak["R"], "source": ak["source"],
                                 **({"unofficial": ak["unofficial"]} if "unofficial" in ak else {})}}} if ak else {}),
    }
    per.sort()
    extremes[key] = {
        "low": [[f, round(r, 3)] for r, f, *_ in per[:5]],
        "high": [[f, round(r, 3)] for r, f, *_ in per[-5:][::-1]],
        "states_low": sorted(states, key=lambda s: states[s][0])[:3],
        "states_high": sorted(states, key=lambda s: -states[s][0])[:3],
    }
checks["decomposition_max_relative_error"] = worst
assert worst < 1e-9, worst

# county table: [pop2010, pop2020, cvap 2014-2018, cvap 2019-2023, pop 18+ 2020]
county = {f: [pop10.get(f, 0), pop20.get(f, 0), cv18.get(f, 0), cv23.get(f, 0), adu20.get(f, 0)]
          for f in sorted(vote_fips)}
zero = [f for f, v in county.items() if 0 in v[:4]]
assert not zero, zero

# represented volume: county share of all apportioned electoral votes among counties on the map
rep = {}
for b in ("2010", "2020"):
    evs = {f: EVB[b][st_of(f)] * POP[b][f] / st_pop[b][st_of(f)] for f in county}
    rep[b] = {"E": round(sum(evs.values()), 6)}

out = {
    "sources": SOURCES,
    "notes": {
        "basis": "Population is the decennial census count: 2010 Census for elections through 2020, 2020 Census from 2022. "
                 "Eligible citizens are the citizen voting-age population from the ACS special tabulation: 2014-2018 for "
                 "elections through 2020, 2019-2023 from 2022. Electoral votes follow the 2010 apportionment for 2016-2020 "
                 "and the 2020 apportionment from 2022.",
        "CT": "The 2019-2023 tabulation uses Connecticut's nine planning regions, which do not nest in the eight historic "
              "counties used here; the state total is shared among the counties by their 2020 Census population 18+.",
        "AK": "Alaska reports by House district, not by county, so it is not on the county maps. Where its certified "
              "statewide total is at hand (president 2016-2024; Senate 2020, 2022 and 2026, the last unofficial), it "
              "counts as one unit in the state figures and the national totals; governor races have no Alaska total "
              "here, so for them it is left out.",
        "fold": "Shannon County SD (46113) is Oglala Lakota (46102); Falls Church city is counted with Fairfax County and "
                "Bedford city with Bedford County, as in the vote data.",
        "senate_governor": "For Senate and governor races the national averages are over the states with a race.",
    },
    "ev": {"2010": EV10, "2020": EV20},
    "stPop": {b: dict(sorted(st_pop[b].items())) for b in st_pop},
    "stCvap": {b: dict(sorted(st_cvap[b].items())) for b in st_cvap},
    "rep": rep,
    "county": county,
    "elections": out_el,
    "extremes": extremes,
    "checks": checks,
}
json.dump(out, open(OUT, "w"), separators=(",", ":"))
print(json.dumps({"checks": checks, "extremes2024": extremes.get("pres2024")}, indent=1))
