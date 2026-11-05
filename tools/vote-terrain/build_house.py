"""House by district for the vote-terrain page: results for 2022, 2024 and 2026 (unofficial), each
district's swing between elections on the same lines, each state's observed swing, the national default for
the plausible swing, and per-state seats against votes and the efficiency gap.

    /usr/bin/python3 -I build_house.py <house district csv> <house state csv> <balance.json> <out house.json>

Inputs are the cascade-research comparison files (cascade-research/notes/data/house-2026-vs-2024-vs-2022-
by-district-unofficial-*.csv and the by-state file built beside it by build_house_2026_comparison.py), whose
note names every source: 2022 the FEC's certified compilation, 2024 the Clerk of the House's statistics,
2026 AP via CNN, unofficial. balance.json supplies the official party divisions the seat counts are checked
against. Margins here are Democratic minus Republican, in points of all votes cast in the race, as on the page.

What the page computes from this (js/house.js; the page states each rule in one line):
  observed swing: the change in a district's margin between two consecutive cycles, only where the state's
    lines did not change between them (the CSV's lines_basis, set state by state) and both races were a
    Democrat against a Republican. Written per district and pair ("sw"), signed, toward the Democrat > 0.
  a state's largest and median observed swing: from its own districts when it has at least MIN_SWINGS of them;
    otherwise the national figures (the median, across the states that have their own, of each state's
    largest and of each state's median).
  plausible swing: one setting behind the bands. Default: the national median absolute observed swing, over
    every district swing on unchanged lines in the data. The reader can change it, or use each state's own
    median ("state observed").
  at risk: a held seat whose margin is below the plausible swing. Captured: a margin above the state's largest
    observed swing, or above the plausible swing when that is higher. Contestable: between.
  captured votes, in a captured seat: the winner's votes beyond what a margin at the captured line needs, plus
    all the runner-up's votes.
  Seats without a Democrat and a Republican on the ballot (uncontested, two of one party, Louisiana's open
  primary) are kept apart: no band, and none of their swings count.
Computed here:
  efficiency gap (Stephanopoulos and McGhee, 2015): wasted Democratic minus wasted Republican votes over all
    two-party votes, where a party's wasted votes are all its votes in districts it lost plus its votes
    beyond half the two-party vote plus one in districts it won. Positive: more Democratic votes wasted.
    Computed only for states with two or more districts, all of them Democrat against Republican.
"""

import csv
import json
import re
import statistics
import sys

DIST_CSV, STATE_CSV, BALANCE, OUT = sys.argv[1:5]
YEARS = ("2022", "2024", "2026")
PAIRS = (("2022", "2024"), ("2024", "2026"))
MIN_SWINGS = 5

# Seats where the state printed no votes (an unopposed candidate is not on the ballot) and the 2022 Alaska
# race, decided by ranked-choice tabulation, where the first-choice count the CSV holds puts the combined
# Republican vote ahead. Each is the winner's party as the year's source lists it.
WINNER_OVERRIDE = {
    ("FL", "5", "2022"): ("R", "FEC federalelections2022.xlsx sheet 8: Rutherford (R), Unopposed"),
    ("LA", "4", "2022"): ("R", "FEC federalelections2022.xlsx sheet 8: Johnson (R), Unopposed"),
    ("FL", "20", "2024"): ("D", "Clerk of the House, Statistics of the 2024 election: Cherfilus-McCormick (D), unopposed"),
    ("OK", "3", "2024"): ("R", "Clerk of the House, Statistics of the 2024 election: Lucas (R), unopposed"),
    ("AK", "1", "2022"): ("D", "Alaska Division of Elections, 2022 general, ranked-choice tabulation: Peltola (D) elected"),
}

rows = list(csv.DictReader(open(DIST_CSV, newline="")))
if len(rows) != 435:
    sys.exit(f"expected 435 districts, found {len(rows)}")
asof = re.search(r"extractedAt ([0-9T:\-\.]+)Z", rows[0]["source_2026"]).group(1)[:19] + "Z"

problems = []
num = lambda s: int(s) if s not in ("", None) else 0


def result(r, y):
    R, D, T = num(r[f"r_votes_{y}"]), num(r[f"d_votes_{y}"]), num(r[f"total_votes_{y}"])
    dvr = r[f"dvr_{y}"] == "yes"
    m = round((D - R) / T * 100, 2) if T else None
    # The CSV's margin is Republican minus Democratic: it must agree with the votes.
    csv_m = r[{"2022": "margin22", "2024": "margin24", "2026": "margin26"}[y]]
    if m is not None and csv_m and abs(-float(csv_m) - m) > 0.011:
        problems.append(f"{r['state']}-{r['district']} {y}: margin {m} vs CSV {csv_m}")
    status = "final"
    key = (r["state"], r["district"], y)
    if key in WINNER_OVERRIDE:
        w = WINNER_OVERRIDE[key][0]
    elif y == "2026":
        called = r["ap_called"] == "yes"
        w = {"REP": "R", "DEM": "D"}.get(r["ap_winner"], "")
        status = "called" if called and w else "leading"
        if not (called and w):
            # Louisiana held an open primary: a plurality there decides nothing until the Dec. 12 runoff.
            w = "" if r["state"] == "LA" or not (R or D) else ("D" if D > R else "R")
            if not w:
                status = "uncalled"
    else:
        w = "D" if D > R else "R" if R > D else ""
    if not w and status != "uncalled":
        problems.append(f"{r['state']}-{r['district']} {y}: no winner and no override")
    reason = "" if dvr else r[f"dvr_{y}"].replace("no: ", "")
    return {"R": R, "D": D, "T": T, "m": m, "w": w, "dvr": dvr, "status": status, "reason": reason}


districts = []
for r in rows:
    d = {"st": r["state"], "n": "AL" if r["lines_basis"] == "at-large" else int(r["district"]), "y": {y: result(r, y) for y in YEARS}}
    lb = r["lines_basis"]
    d["same"] = {f"{a}-{b}": lb == "at-large" or f"{a}->{b} map same" in lb for a, b in PAIRS}
    # Swing between two elections on the same lines, Democrat against Republican in both: toward the Democrat > 0.
    d["sw"] = {}
    for a, b in PAIRS:
        x, z = d["y"][a], d["y"][b]
        d["sw"][f"{a}-{b}"] = round(z["m"] - x["m"], 2) if d["same"][f"{a}-{b}"] and x["dvr"] and z["dvr"] and x["T"] and z["T"] else None
    districts.append(d)
if problems:
    sys.exit("problems:\n  " + "\n  ".join(problems))

states = sorted({d["st"] for d in districts})
by_st = {st: [d for d in districts if d["st"] == st] for st in states}

# ---------- observed swing: each state's largest and median, and the national default ----------
pool = [abs(s) for d in districts for s in d["sw"].values() if s is not None]
plausible = {"value": round(statistics.median(pool), 1), "n": len(pool),
             "how": f"national median observed swing: the median of {len(pool)} district swings between elections on unchanged lines, 2022 to 2026"}
thr, own_n = {}, {}
for st in states:
    swings, used = [], []
    for a, b in PAIRS:
        got = [abs(d["sw"][f"{a}-{b}"]) for d in by_st[st] if d["sw"][f"{a}-{b}"] is not None]
        if got:
            used.append(f"{a} to {b}")
        swings += got
    own_n[st] = len(swings)
    if len(swings) >= MIN_SWINGS:
        thr[st] = {"largest": round(max(swings), 2), "median": round(statistics.median(swings), 2), "n": len(swings),
                   "basis": "own districts, " + " and ".join(used)}
national = {"largest": round(statistics.median(t["largest"] for t in thr.values()), 2),
            "median": round(statistics.median(t["median"] for t in thr.values()), 2), "states": len(thr)}
for st in states:
    if st not in thr:
        n = own_n[st]
        thr[st] = {"largest": national["largest"], "median": national["median"], "n": n,
                   "basis": "national figures: " + ("no district here had a Democrat-vs-Republican race on the same lines in two consecutive cycles" if not n
                            else f"only {n} observed swing{'s' if n > 1 else ''} here, fewer than {MIN_SWINGS}")}

# ---------- seats and the efficiency gap ----------
seats, per_state = {}, {}
for y in YEARS:
    counts = {"D": 0, "R": 0, "called": {"D": 0, "R": 0}, "leading": {"D": 0, "R": 0}, "uncalled": 0, "uncalledSeats": []}
    for st in states:
        ds = by_st[st]
        sD = sum(d["y"][y]["w"] == "D" for d in ds); sR = sum(d["y"][y]["w"] == "R" for d in ds)
        for d in ds:
            x = d["y"][y]
            if x["w"]:
                counts[x["w"]] += 1
                if y == "2026":
                    counts["called" if x["status"] == "called" else "leading"][x["w"]] += 1
            else:
                counts["uncalled"] += 1; counts["uncalledSeats"].append(f"{st}-{d['n']}")
        D = sum(d["y"][y]["D"] for d in ds); R = sum(d["y"][y]["R"] for d in ds); T = sum(d["y"][y]["T"] for d in ds)
        eg, eg_why = None, ""
        if len(ds) < 2:
            eg_why = "one district"
        elif not all(d["y"][y]["dvr"] for d in ds):
            eg_why = f"{sum(not d['y'][y]['dvr'] for d in ds)} of {len(ds)} seats without a Democrat and a Republican"
        else:
            wD = wR = tp = 0
            for d in ds:
                x = d["y"][y]; two = x["D"] + x["R"]; need = two // 2 + 1; tp += two
                if x["D"] > x["R"]:
                    wD += x["D"] - need; wR += x["R"]
                else:
                    wR += x["R"] - need; wD += x["D"]
            eg = round((wD - wR) / tp * 100, 2)
        per_state.setdefault(y, {})[st] = {"districts": len(ds), "D": D, "R": R, "T": T,
            "dshare": round(D / (D + R) * 100, 2) if D + R else None, "seatsD": sD, "seatsR": sR, "eg": eg, "egWhy": eg_why}
    seats[y] = counts

# ---------- checks ----------
bal = json.load(open(BALANCE))["elections"]
for y, k in (("2022", "d2022"), ("2024", "pres2024")):
    h = bal[k]["house"]
    if (seats[y]["D"], seats[y]["R"]) != (h["D"], h["R"]):
        sys.exit(f"{y}: seats D {seats[y]['D']} R {seats[y]['R']} differ from the House history office's D {h['D']} R {h['R']}")
srows = {r["state"]: r for r in csv.DictReader(open(STATE_CSV, newline=""))}
for y in YEARS:
    for st in states:
        s, p = srows[st], per_state[y][st]
        for col, key in (("r_votes", "R"), ("d_votes", "D"), ("total_votes", "T")):
            if num(s[f"{col}_{y}"]) != p[key]:
                sys.exit(f"{st} {y} {col}: districts sum to {p[key]}, state file says {s[col + '_' + y]}")
        if int(s["districts"]) != p["districts"]:
            sys.exit(f"{st}: {p['districts']} districts, state file says {s['districts']}")

out = {
    "csv": "cascade-research/notes/data/" + DIST_CSV.rsplit("/", 1)[-1],
    "sources": {
        "2022": "FEC, Federal Elections 2022 (certified), sheet 8: https://www.fec.gov/documents/5676/federalelections2022.xlsx",
        "2024": "Clerk of the House, Statistics of the Presidential and Congressional Election of November 5, 2024: https://clerk.house.gov/member_info/electionInfo/2024/statistics2024.pdf",
        "2026": f"AP via CNN, https://politics.api.cnn.io/results/national-races/2026-HG.json, unofficial as of {asof}",
        "lines": "Whether each state's map changed between cycles, from the sources listed in cascade-research/notes/house-2026-vs-2024-vs-2022-2026-11-04.md (set state by state)",
    },
    "asof2026": asof,
    "overrides": {f"{k[0]}-{k[1]} {k[2]}": v[1] for k, v in WINNER_OVERRIDE.items()},
    "years": list(YEARS),
    "pairs": [f"{a}-{b}" for a, b in PAIRS],
    # One row per district: state, number (AL at large), per year [Republican, Democratic, total votes, margin
    # (D-R points, null when no votes were printed), winner (D, R, or "" undecided)], the swing for each pair
    # (null unless the lines held and both races were Democrat vs Republican), the 2026 status (called,
    # leading or uncalled) and, per year, why a race was not Democrat vs Republican.
    "districts": [{"st": d["st"], "n": d["n"],
                   "y": {y: [d["y"][y]["R"], d["y"][y]["D"], d["y"][y]["T"], d["y"][y]["m"], d["y"][y]["w"]] for y in YEARS},
                   "sw": [d["sw"][p] for p in (f"{a}-{b}" for a, b in PAIRS)],
                   "status2026": d["y"]["2026"]["status"],
                   "reason": {y: d["y"][y]["reason"] for y in YEARS if d["y"][y]["reason"]}} for d in districts],
    "threshold": thr,
    "national": national,
    "plausible": plausible,
    "minSwings": MIN_SWINGS,
    "seats": seats,
    "states": per_state,
}
json.dump(out, open(OUT, "w"), separators=(",", ":"))

# Bands at the default plausible swing, as a check on what the page will show (the page computes them).
P = plausible["value"]
print(f"wrote {OUT}: {len(districts)} districts; 2026 as of {asof}")
print(f"  plausible swing default {P} points ({plausible['how']})")
for y in YEARS:
    s = seats[y]
    b = {"captured": 0, "contestable": 0, "at risk": 0, "apart": 0}
    for d in districts:
        x = d["y"][y]
        if not (x["dvr"] and x["m"] is not None):
            b["apart"] += 1; continue
        a, cap = abs(x["m"]), max(thr[d["st"]]["largest"], P)
        b["captured" if a > cap else "at risk" if a < P else "contestable"] += 1
    extra = f" (called D {s['called']['D']} R {s['called']['R']}; leading D {s['leading']['D']} R {s['leading']['R']}; undecided {', '.join(s['uncalledSeats'])})" if y == "2026" else ""
    print(f"  {y}: D {s['D']} R {s['R']}{extra}; bands at default {b}")
print(f"  national figures for states with fewer than {MIN_SWINGS} swings: largest {national['largest']}, median {national['median']} (across {national['states']} states)")
print("  checks: seat counts match the House history office (2022, 2024); district votes sum to the state file in every state and year")
