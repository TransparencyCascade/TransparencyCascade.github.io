"""The voter funnel for the vote-terrain page: from residents to ballots counted, by state and county, 2016-2024.

    python3 -I tools/vote-terrain/build_funnel.py <eavs dir> static/maps/vote-terrain

<eavs dir> holds the EAC's Election Administration and Voting Survey (EAVS) public CSV files, one per election
(downloaded from https://www.eac.gov/research-and-data/datasets-codebooks-and-surveys; kept in
tools/vote-terrain/.eavs-cache, not committed). The page folder is read for elections.json and effective.json
(votes, census residents and citizen voting-age population) and funnel.json is written there.

Files (SOURCES below): 2016 V1.1, 2018 V1.3 (Updates3), 2020 V1.2, 2022 V1, 2024 V2 (Feb 2026), the "nolabel" CSV of
each. Every figure carries its EAVS item code; the codes change between waves (ITEMS below), so the file records the
code used for each year.

Stages, in funnel order (ids in funnel.json):
  pop       residents: the census count effective.json uses (2010 Census for 2016-2020, 2020 Census for 2022-2024)
  cvap      citizens of voting age: ACS special tabulation, as effective.json (2014-2018 for 2016-2020, 2019-2023 for 2022-2024)
  reg       registered voters, active and inactive (A1a); the page shows inactive records as a band beside the active bar,
            because they stay on the rolls until removed under the NVRA's notice-and-wait process (52 U.S.C. 20507(d))
  act       of them active (A1b; A3a in 2016): the page's main registered bar
  rem       removed from the rolls since the last general election, by reason (A11a / A9a / A12a; reasons b..g, 2024 adds h)
  mail_ret  mail ballots returned by voters (C1b), the base for the mail rejection rate
  mail_rej  mail ballots rejected (C4b in 2016, C4a in 2018 and 2020, C9a from 2022)
  prov      provisional ballots cast (E1a);  prov_rej  provisional ballots rejected (E1d)
  counted   people whose ballot was counted (F1a)
  cast      ballots cast: DERIVED, counted + mail rejected + provisional rejected. EAVS has no total-cast item. A
            jurisdiction that did not report a rejected count adds nothing for it, so cast is a floor.

Missing values. EAVS marks a figure that is not there with a negative code (-88 not applicable, -99 data not
available from 2018; -888888 and -999999 before, as text in the 2016 CSV) or leaves it blank. All are MISSING, never
zero: a jurisdiction with a missing figure adds nothing to that figure's sum, and is counted in `miss` (with the
registered voters it holds in `missReg`), so a reader sees a sum is a floor. A county's figure is null when any
jurisdiction in it is missing. Missing codes per year and item are in checks.missingCodes.

Jurisdictions. EAVS reports by county in most states and by town in the six New England states (CT, MA, ME, NH, RI, VT).
A town's 10-digit FIPS code starts with its county's five digits (state 2, county 3), and towns are summed by those five
digits, so county = the sum of its towns. Connecticut's codes are the eight historic counties the page uses. Wisconsin
reports by municipality with no county code (a place that straddles counties is "MULTIPLE COUNTIES"), and Alaska reports
as one unit, so both are state rows only. Falls Church city is folded into Fairfax County, Bedford city into Bedford County
and Shannon County SD is Oglala Lakota, as on the page. Territories (PR, GU, VI, AS, MP) are left out.

Checks, printed and kept in checks: EAVS people counted per state against the page's certified turnout (presidential
votes in 2016, 2020 and 2024; the largest Senate or governor total in 2018 and 2022), within TOL; the counties on the
page without an EAVS row and the reverse; the registered and removed totals against the harmonised research file
(cascade-research/notes/data/eavs-removals-registration-jurisdiction-harmonized-2008-2024-2026-11-05.csv) when present.
"""
import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict

EAVS_DIR, PAGE = sys.argv[1:3]
TOL = 0.05   # people counted may exceed a race's votes (a ballot can skip it) by up to 5%, and may not fall below it by more than 1%
YEARS = [2016, 2018, 2020, 2022, 2024]
EAC = "https://www.eac.gov/research-and-data/datasets-codebooks-and-surveys"
SOURCES = {
    2016: ("EAVS_2016_Final_Data_for_Public_Release_nolabel_V1.1_CSV.csv", "2016 EAVS V1.1", "https://www.eac.gov/sites/default/files/EAVS_2016_for_Public_Release_nolabel_V1.1_CSV.zip"),
    2018: ("EAVS2018_Updates3.csv", "2018 EAVS V1.3 (Updates3)", EAC),
    2020: ("2020_EAVS_for_Public_Release_nolabel_V1.2_CSV.csv", "2020 EAVS V1.2", "https://www.eac.gov/sites/default/files/2023-12/2020_EAVS_for_Public_Release_nolabel_V1.2_CSV.zip"),
    2022: ("2022_EAVS_for_Public_Release_nolabel_V1.csv", "2022 EAVS V1", "https://www.eac.gov/sites/default/files/2023-06/2022_EAVS_for_Public_Release_nolabel_V1_CSV.zip"),
    2024: ("2024_EAVS_for_Public_Release_nolabel_V2.csv", "2024 EAVS V2 (Feb 2026)", "https://www.eac.gov/sites/default/files/2026-02/2024_EAVS_for_Public_Release_nolabel_V2_csv.zip"),
}
# item id -> (label, {year: EAVS code}); the order is the order of every row in funnel.json
ITEMS = [
    ("reg", "Registered voters", {y: "A1a" for y in YEARS}),
    ("act", "Active registered voters", {2016: "A3a", **{y: "A1b" for y in YEARS[1:]}}),
    ("rem", "Removed from the rolls", {2016: "A11a", 2018: "A9a", 2020: "A9a", 2022: "A9a", 2024: "A12a"}),
    ("rem_moved", "Removed: moved", {2016: "A11b", 2018: "A9b", 2020: "A9b", 2022: "A9b", 2024: "A12b"}),
    ("rem_death", "Removed: death", {2016: "A11c", 2018: "A9c", 2020: "A9c", 2022: "A9c", 2024: "A12c"}),
    ("rem_felony", "Removed: felony", {2016: "A11d", 2018: "A9d", 2020: "A9d", 2022: "A9d", 2024: "A12d"}),
    ("rem_nonresp", "Removed: failed to respond to a notice and did not vote", {2016: "A11e", 2018: "A9e", 2020: "A9e", 2022: "A9e", 2024: "A12e"}),
    ("rem_mental", "Removed: mental incompetence", {2016: "A11f", 2018: "A9f", 2020: "A9f", 2022: "A9f", 2024: "A12f"}),
    ("rem_request", "Removed: at the voter's request", {2016: "A11g", 2018: "A9g", 2020: "A9g", 2022: "A9g", 2024: "A12g"}),
    ("rem_dup", "Removed: duplicate record", {2024: "A12h"}),
    ("mail_ret", "Mail ballots returned by voters", {y: "C1b" for y in YEARS}),
    ("mail_rej", "Mail ballots rejected", {2016: "C4b", 2018: "C4a", 2020: "C4a", 2022: "C9a", 2024: "C9a"}),
    ("prov", "Provisional ballots cast", {y: "E1a" for y in YEARS}),
    ("prov_rej", "Provisional ballots rejected", {y: "E1d" for y in YEARS}),
    ("counted", "People whose ballot was counted", {y: "F1a" for y in YEARS}),
]
IDS = [i[0] for i in ITEMS] + ["cast"]
IX = {k: n for n, k in enumerate(IDS)}
FIPS_ST = dict(zip("01 02 04 05 06 08 09 10 11 12 13 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 44 45 46 47 48 49 50 51 53 54 55 56".split(),
                   "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split()))
FOLD = {"51610": "51059", "51515": "51019", "46113": "46102"}   # as effective.json
STATE_ONLY = {"AK", "WI"}   # no county rows (see the docstring)
# Election authorities that are a city, not a county, and whose code is not a county's: Illinois's five city election commissions each lie in
# one county and are added to it (the page's Cook County has Chicago's votes); other such units (Kansas City MO, which spans four counties, and
# Maine's unorganized townships and islands) are in the state row only and listed in checks.notInACounty.
CITY_COUNTY = {("IL", "BLOOMINGTON CITY"): "17113", ("IL", "CHICAGO CITY"): "17031", ("IL", "EAST ST. LOUIS CITY"): "17163",
               ("IL", "GALESBURG CITY"): "17095", ("IL", "ROCKFORD CITY"): "17201"}
WEB = os.path.join(PAGE)


def cell(raw):
    """(value, code): value is a non-negative number or None; code names why it is missing ('' when it is not)."""
    t = (raw or "").strip().replace(",", "")
    if t == "":
        return None, "blank"
    m = re.match(r"^(-\d+)\s*:", t)
    if m:
        return None, m.group(1)
    try:
        v = float(t)
    except ValueError:
        return None, "text"
    if v < 0:
        return None, str(int(v))
    return v, ""


def read_year(y):
    path = os.path.join(EAVS_DIR, SOURCES[y][0])
    with open(path, encoding="latin-1", newline="") as f:
        rd = csv.DictReader(f)
        head = rd.fieldnames
        sc = "State_Abbr" if "State_Abbr" in head else "State"
        jc = "Jurisdiction_Name" if "Jurisdiction_Name" in head else "JurisdictionName"
        for code in (c for _, _, m in ITEMS for yy, c in m.items() if yy == y):
            if code not in head:
                sys.exit(f"{y}: {code} is not a column of {SOURCES[y][0]}")
        for r in rd:
            yield r[sc].strip(), r["FIPSCode"].strip().zfill(10) if len(r["FIPSCode"].strip()) > 5 else r["FIPSCode"].strip(), r[jc].strip(), r


def main():
    elections = json.load(open(os.path.join(WEB, "elections.json")))["elections"]
    eff = json.load(open(os.path.join(WEB, "effective.json")))
    codes = defaultdict(Counter)   # (year, item) -> missing code counts
    st_acc = {y: defaultdict(lambda: {"v": [0.0] * len(IDS), "miss": [0] * len(IDS), "missReg": [0.0] * len(IDS), "n": 0, "pr": [0.0] * 10, "has": [0] * len(IDS)}) for y in YEARS}
    co_acc = {y: defaultdict(lambda: {"v": [0.0] * len(IDS), "bad": [False] * len(IDS), "n": 0}) for y in YEARS}
    jur_count = Counter()
    not_in_county = defaultdict(list)
    for y in YEARS:
        for st, fips, name, r in read_year(y):
            if st not in FIPS_ST.values():
                continue
            vals = {}
            for k, _, m in ITEMS:
                if y not in m:
                    vals[k] = (None, "notasked")
                    continue
                v, c = cell(r[m[y]])
                vals[k] = (v, c)
                if c:
                    codes[(y, k)][c] += 1
            # cast: counted + the rejected counts that were reported (a floor)
            cv = vals["counted"][0]
            vals["cast"] = (None if cv is None else cv + (vals["mail_rej"][0] or 0) + (vals["prov_rej"][0] or 0), "" if cv is not None else "derived")
            jur_count[(y, st)] += 1
            reg = vals["reg"][0]
            A = st_acc[y][st]
            A["n"] += 1
            for k in IDS:
                v, c = vals[k]
                if c == "notasked":
                    continue
                A["has"][IX[k]] = 1
                if v is None:
                    A["miss"][IX[k]] += 1
                    A["missReg"][IX[k]] += reg or 0
                else:
                    A["v"][IX[k]] += v
            # pairwise-valid rate parts: removal / registered, mail rejected / returned, provisional rejected / cast, counted / registered, active / registered
            # (the last pair makes the inactive count: registered less active, in the jurisdictions that reported both)
            for n, (a, b) in enumerate([("rem", "reg"), ("mail_rej", "mail_ret"), ("prov_rej", "prov"), ("counted", "reg"), ("act", "reg")]):
                if vals[a][0] is not None and vals[b][0] is not None:
                    A["pr"][2 * n] += vals[a][0]
                    A["pr"][2 * n + 1] += vals[b][0]
            # county: fold into the county digits (Alaska and Wisconsin are state rows only)
            if st in STATE_ONLY or len(fips) < 10:
                continue
            ck = FOLD.get(fips[:5], fips[:5])
            if ck not in eff["county"]:
                ck = CITY_COUNTY.get((st, name))
                if ck is None:
                    not_in_county[y].append({"st": st, "name": name, "fips": fips, "reg": vals["reg"][0], "counted": vals["counted"][0]})
                    continue
            C = co_acc[y][ck]
            C["n"] += 1
            for k in IDS:
                v, c = vals[k]
                if c == "notasked":
                    continue
                if v is None:
                    C["bad"][IX[k]] = True
                else:
                    C["v"][IX[k]] += v
    # ---- page data: residents, citizens of voting age, votes ----
    bases = {"2010": 0, "2020": 1}
    page_counties = sorted(eff["county"])
    pop_of = {b: {f: eff["county"][f][bases[b]] for f in page_counties} for b in bases}
    cvap_of = {b: {f: eff["county"][f][2 + bases[b]] for f in page_counties} for b in bases}
    basis_of = {2016: "2010", 2018: "2010", 2020: "2010", 2022: "2020", 2024: "2020"}
    counties = sorted(set(page_counties))
    # counties with EAVS rows: any year
    with_rows = set()
    for y in YEARS:
        with_rows |= set(co_acc[y])
    page_only = [f for f in counties if f not in with_rows and FIPS_ST.get(f[:2]) not in STATE_ONLY]
    # ---- write rows ----
    def rnd(v):
        return None if v is None else (int(v) if float(v).is_integer() else round(v, 2))
    out_county = {}
    for y in YEARS:
        have = [IX[k] for k, _, m in ITEMS if y in m] + [IX["cast"]]
        rows = {}
        for f in counties:
            C = co_acc[y].get(f)
            if not C:
                continue
            rows[f] = [None if (i not in have or C["bad"][i]) else rnd(C["v"][i]) for i in range(len(IDS))]
        out_county[str(y)] = rows
    out_state, nat = {}, {}
    st_pop = {b: dict(eff["stPop"][b]) for b in bases}
    st_cvap = {b: dict(eff["stCvap"][b]) for b in bases}
    # Alaska's whole census count (checks.population) in place of stPop's, which can leave out county-equivalents created after the outlines were drawn
    for b in bases:
        st_pop[b]["AK"] = eff["checks"]["population"][f"{b}_census_AK"]
        tot = sum(st_pop[b].values())
        want = eff["checks"]["population"][f"{b}_census_us_total"]
        assert tot == want, (b, tot, want)
    for y in YEARS:
        out_state[str(y)] = {}
        tot = {"v": [0.0] * len(IDS), "miss": [0] * len(IDS), "missReg": [0.0] * len(IDS), "n": 0, "pr": [0.0] * 10}
        for st, A in sorted(st_acc[y].items()):
            # a figure every jurisdiction in the state left out is missing (null), not a sum of nothing; its missing count is kept
            asked, got = A["has"], [h and A["miss"][i] < A["n"] for i, h in enumerate(A["has"])]
            out_state[str(y)][st] = {"n": A["n"], "v": [rnd(x) if got[i] else None for i, x in enumerate(A["v"])], "miss": [A["miss"][i] if asked[i] else None for i in range(len(IDS))],
                                     "missReg": [rnd(A["missReg"][i]) if asked[i] else None for i in range(len(IDS))], "pr": [rnd(x) for x in A["pr"]]}
            for i in range(len(IDS)):
                tot["v"][i] += A["v"][i]
                tot["miss"][i] += A["miss"][i]
                tot["missReg"][i] += A["missReg"][i]
            tot["n"] += A["n"]
            tot["pr"] = [a + b for a, b in zip(tot["pr"], A["pr"])]
        asked = [(k == "cast" or any(y == yy for yy in dict((i[0], i[2]) for i in ITEMS)[k])) and tot["miss"][IDS.index(k)] < tot["n"] for k in IDS]
        nat[str(y)] = {"n": tot["n"], "v": [rnd(x) if asked[i] else None for i, x in enumerate(tot["v"])], "miss": [x if asked[i] else None for i, x in enumerate(tot["miss"])],
                       "missReg": [rnd(x) if asked[i] else None for i, x in enumerate(tot["missReg"])], "pr": [rnd(x) for x in tot["pr"]]}
    # ---- check: people counted against the page's certified turnout ----
    page_votes = {}   # (year, st) -> (votes, which race)
    def county_sum(e):
        s = defaultdict(float)
        for f, v in elections[e]["data"].items():
            s[FIPS_ST.get(f[:2])] += v[0]
        return s
    for y, es in [(2016, ["pres2016"]), (2018, ["sen2018", "gov2018"]), (2020, ["pres2020"]), (2022, ["sen2022", "gov2022"]), (2024, ["pres2024"])]:
        best = {}
        for e in es:
            s = county_sum(e)
            for st, v in s.items():
                if v > best.get(st, (0, ""))[0]:
                    best[st] = (v, e)
            for st, x in (eff["elections"].get(e, {}).get("stateOnly") or {}).items():
                if x["votes"] > best.get(st, (0, ""))[0]:
                    best[st] = (x["votes"], e)
        for st, (v, e) in best.items():
            page_votes[(y, st)] = (v, e)
    turnout = {"tolerance": f"people counted (F1a) over the page's votes must be within -1% to +{int(TOL * 100)}% (a ballot can skip a race); presidential years compare the presidential votes, 2018 and 2022 the largest Senate or governor total the page has in the state (a floor, so only the lower bound is a test)", "rows": [], "mismatches": []}
    for y in YEARS:
        for st in sorted(out_state[str(y)]):
            if (y, st) not in page_votes:
                continue
            S = out_state[str(y)][st]
            counted = S["v"][IX["counted"]]
            pv, e = page_votes[(y, st)]
            ratio = counted / pv if pv else None
            miss = S["miss"][IX["counted"]]
            row = {"year": y, "st": st, "counted": counted, "page": int(pv), "race": e, "ratio": None if ratio is None else round(ratio, 4), "missJur": miss}
            presidential = e.startswith("pres")
            bad = ratio is None or ratio < 0.99 or (presidential and ratio > 1 + TOL)
            row["ok"] = not bad
            turnout["rows"].append(row)
            if bad:
                turnout["mismatches"].append(row)
    # ---- check: against the harmonised research file ----
    harm = os.path.expanduser("~/tcp-kb-internal/cascade-research/notes/data/eavs-removals-registration-jurisdiction-harmonized-2008-2024-2026-11-05.csv")
    harmcheck = None
    if os.path.exists(harm):
        hs = defaultdict(lambda: [0.0, 0.0])
        for r in csv.DictReader(open(harm, encoding="utf-8")):
            y = int(r["year"])
            if y in YEARS and r["state"] in FIPS_ST.values():
                if r["reg_total_status"] == "ok" and r["reg_total"]:
                    hs[(y, r["state"], "reg")][0] += float(r["reg_total"])
                if r["rem_total_status"] == "ok" and r["rem_total"]:
                    hs[(y, r["state"], "rem")][0] += float(r["rem_total"])
        diffs = []
        for (y, st, k), (v, _) in hs.items():
            mine = out_state[str(y)].get(st, {}).get("v", [None] * len(IDS))[IX[k]]
            if mine is None or abs(mine - v) > max(1, 0.001 * v):
                diffs.append((y, st, k, v, mine))
        harmcheck = {"compared": len(hs), "differ": len(diffs), "differences": [{"year": a, "st": b, "item": c, "harmonised": d, "here": e} for a, b, c, d, e in sorted(diffs)[:40]]}
    miss_codes = {}
    for (y, k), c in sorted(codes.items()):
        miss_codes.setdefault(str(y), {})[k] = dict(c)
    miss_by_state = {str(y): {st: {k: out_state[str(y)][st]["miss"][IX[k]] for k in IDS if out_state[str(y)][st]["miss"][IX[k]]} for st in out_state[str(y)]} for y in YEARS}
    items_meta = [{"id": k, "label": l, "eavs": {str(y): c for y, c in m.items()}} for k, l, m in ITEMS] + \
                 [{"id": "cast", "label": "Ballots cast (derived: counted + mail rejected + provisional rejected; a floor)", "eavs": {str(y): "F1a + " + dict((k, m) for k, _, m in ITEMS)["mail_rej"][y] + " + E1d" for y in YEARS}}]
    out = {
        "meta": {
            "what": "EAVS stages from residents to ballots counted, by state and county, with each figure's EAVS item code",
            "sources": [{"year": y, "file": SOURCES[y][0], "version": SOURCES[y][1], "url": SOURCES[y][2]} for y in YEARS] +
                       [{"what": "residents and citizen voting-age population: effective.json (2010 and 2020 Census; ACS CVAP 2014-2018 and 2019-2023)"}],
            "years": YEARS, "basis": {str(y): basis_of[y] for y in YEARS}, "items": items_meta, "ids": IDS,
            "rows": "each row is a value per id in ids; null is missing (never zero). State rows: v the sum of jurisdictions with a figure, miss the jurisdictions without, missReg the registered voters in them, pr the pairwise-valid rate parts [removed, registered, mail rejected, mail returned, provisional rejected, provisional cast, counted, registered, active, registered]; inactive = pr[9] - pr[8] (registered less active, in the jurisdictions that reported both).",
            "notes": {
                "towns": "New England states report by town. A town's 10-digit FIPS code starts with its county's five digits, and towns are summed by those five digits. Connecticut's codes are the eight historic counties the page uses.",
                "stateOnly": "Alaska reports as one unit and Wisconsin by municipality with no county code, so both are state rows only.",
                "counties": "A county's figure is null when any jurisdiction in it has no figure for that item.",
                "guards": "A removed registration or a rejected ballot is not a count of eligible voters turned away; the page shows the reasons as the jurisdictions reported them.",
                "cast": "EAVS has no total-cast item; ballots cast is counted + mail rejected + provisional rejected (a floor)",
                "removalWindow": "removals are counted from the close of registration for the previous November general election to the close of registration for this one",
                "dup": "2024 adds A12h removed duplicate records and A12a includes it; earlier waves have no such item",
            },
        },
        "counties": counties,
        "pop": {b: [pop_of[b][f] for f in counties] for b in bases},
        "cvap": {b: [cvap_of[b][f] for f in counties] for b in bases},
        "statePop": st_pop, "stateCvap": st_cvap,
        "county": out_county, "state": out_state, "national": nat,
        "checks": {"turnout": turnout, "missingCodes": miss_codes, "missingJurisdictionsByState": miss_by_state,
                   "countiesOnPageWithoutEavs": page_only, "notInACounty": {str(y): not_in_county[y] for y in YEARS}, "harmonised": harmcheck,
                   "jurisdictions": {str(y): sum(v for (yy, _), v in jur_count.items() if yy == y) for y in YEARS}},
    }
    # compact: items are arrays; write without whitespace
    path = os.path.join(PAGE, "funnel.json")
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {path} ({os.path.getsize(path) / 1e6:.2f} MB)")
    print("jurisdictions per year", out["checks"]["jurisdictions"])
    print("counties on the page without EAVS rows:", page_only)
    print("jurisdictions in a state row but no county row:", {y: len(v) for y, v in not_in_county.items()})
    print(f"turnout check: {len(turnout['rows'])} state-years, {len(turnout['mismatches'])} outside tolerance")
    for r in turnout["mismatches"]:
        print("   ", r)
    print("harmonised:", None if harmcheck is None else {k: harmcheck[k] for k in ("compared", "differ")})
    for y in YEARS:
        N = nat[str(y)]
        print(y, {k: N["v"][IX[k]] for k in IDS}, "miss", {k: N["miss"][IX[k]] for k in IDS if N["miss"][IX[k]]})


main()
