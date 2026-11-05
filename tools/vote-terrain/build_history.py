"""The long view for the vote-terrain page (History tab): residents per House seat at each census since 1910,
the smallest change that would have flipped each presidential election since 1976, and the weight of a vote
in the Senate and the Electoral College in each presidential year since 1976.

    /usr/bin/python3 -I build_history.py <vt-history dir> <balance.json> <out history.json>

Reads the files gathered for research ticket vt-historical-depth-house-and-presidential
(cascade-research/notes/data/vt-history/, with its method note vt-historical-depth-method-note.md):
  apportionment-by-state-1910-2020.csv     Census Bureau, 2020 Census apportionment data file (public domain)
  president-smallest-change-1976-2024.csv  computed from MIT Election Data and Science Lab, U.S. President
                                           1976-2024 (CC0), the page's own rule (half each state's margin plus one)
  president-by-state-1976-2024-mit.csv     the same MIT file's state totals, with each state's electoral votes
                                           from the census in force
The series start where the gathered data starts: 1910 for apportionment, 1976 for presidential results.

Per seat: the Census Bureau's published apportionment population per representative (national and by state);
the House size is the seats in force (the 1920 census was not followed by a reapportionment, so its row carries
the 1910 seats). The 1929 act is cited to the House history office's page, fetched 2026-11-05.

Weight per vote, each presidential year: the census in force is the last one taken at least two years before
the election (the 1980 census set the electoral votes of 1984 and 1988), so 1976 and 1980 use 1970 and 2024
uses 2020. Residents per senator compares the most and least populous states (two senators each, so the ratio
is their populations' ratio). Electoral votes per vote cast compares the states (and DC) where one vote cast
carried the most and the least of an electoral vote: electoral votes divided by total presidential votes.

Tipping state against the nation (the "bias" chart and the Road to 270 readout), each presidential year: states are ordered
by two-party margin (Democratic minus Republican votes over their sum) from the winner's strongest state, the winner's
held district electors counted first, and the state whose electoral votes first bring the winner to 270 is the tipping
state. Maine and Nebraska: the statewide vote carries the state's two at-large electors (the CSV's
ev_winner_take_all_portion); the district electors (electoral_votes_allocated minus that) are held as cast, outside the
ordering, each going to the statewide winner except the districts that split, ME-2 (Republican 2016, 2020, 2024) and
NE-2 (Democratic 2008, 2020, 2024), named in the method note and checked here against the pledged electoral votes of
president-smallest-change-1976-2024.csv in all 13 years and against simulator.json's held districts for 2016-2024.
The gap is the tipping state's two-party margin in points minus the national two-party margin (both Democratic minus
Republican, so a negative gap is a tipping state more Republican than the nation); the ratio is the national vote margin
over the tipping state's vote margin. National figures are the sum of the states' MIT totals (DC included).

Checks: the states' seats add to the national row in every census; the smallest change for 2016, 2020 and 2024
equals balance.json's (both from certified state totals), so the History tab and the balance box agree.
"""
import csv
import json
import sys
from collections import defaultdict

HIST, BALANCE, OUT = sys.argv[1:4]
ELECTIONS = sys.argv[4] if len(sys.argv) > 4 else f"{OUT.rsplit('/', 1)[0]}/elections.json"
STATES = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA", "Colorado": "CO",
    "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
    "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA",
    "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
    "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
    "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA",
    "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX",
    "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
    "Wisconsin": "WI", "Wyoming": "WY",
}
CAP = {
    "passed": "1929-06-11", "signed": "1929-06-18", "seats": 435,
    "text": "The Permanent Apportionment Act of 1929 fixed the House at 435 seats, the size set after the 1910 Census; no reapportionment followed the 1920 Census.",
    "source": "History, Art & Archives, U.S. House of Representatives, \"The Permanent Apportionment Act of 1929\", https://history.house.gov/Historical-Highlights/1901-1950/The-Permanent-Apportionment-Act-of-1929/",
}


SPLIT = {2008: {"NE": "D"}, 2016: {"ME": "R"}, 2020: {"ME": "R", "NE": "D"}, 2024: {"ME": "R", "NE": "D"}}   # district electors that went against the statewide winner


def tipping_vs_nation(pres_csv, pledged_csv, elections_path, sim_path):
    rows = defaultdict(list)
    for r in csv.DictReader(open(pres_csv)):
        rows[int(r["year"])].append(r)
    pledged = {int(r["year"]): (r["winner_party"], int(r["winner_ev_pledged"]), int(r["runner_up_ev_pledged"])) for r in csv.DictReader(open(pledged_csv))}
    try:
        sim = json.load(open(sim_path))
        have = set(json.load(open(elections_path))["elections"])
    except FileNotFoundError:
        sim, have = None, set()
    out = []
    for y in sorted(rows):
        held = {"D": 0, "R": 0}
        segs = []
        for r in rows[y]:
            d, rr, ev, wta = int(r["democratic_votes"]), int(r["republican_votes"]), int(r["electoral_votes_allocated"]), int(r["ev_winner_take_all_portion"])
            if wta < ev:
                win = "D" if d > rr else "R"
                dist = ev - wta
                other = SPLIT.get(y, {}).get(r["state_po"])
                held[win] += dist - (1 if other else 0)
                if other:
                    held[other] += 1
                ev = wta
            segs.append({"st": r["state_po"], "name": r["state"], "ev": ev, "D": d, "R": rr})
        mit = {s["st"]: (s["D"], s["R"]) for s in segs}
        src = "MIT"
        if sim and str(y) in sim["days"] and sim["days"][str(y)].get("pres"):
            # Where the page holds certified FEC totals (simulator.json, 2016-2024) they replace MIT's, so this chart,
            # the Road to 270 bar and the balance box agree; the MIT figures stay in the row.
            ss = sim["days"][str(y)]["pres"]["states"]
            for s in segs:
                assert s["ev"] == ss[s["st"]][2] and abs(s["D"] - ss[s["st"]][0]) < 0.01 * s["D"], (y, s["st"])
                s["D"], s["R"] = ss[s["st"]][0], ss[s["st"]][1]
            src = "FEC"
        evD = held["D"] + sum(s["ev"] for s in segs if s["D"] > s["R"])
        evR = held["R"] + sum(s["ev"] for s in segs if s["R"] > s["D"])
        assert (evD + evR) == 538 and pledged[y][0] == ("D" if evD > evR else "R") and sorted((evD, evR)) == sorted(pledged[y][1:]), (y, evD, evR, pledged[y])
        win = "D" if evD >= 270 else "R"
        pts = lambda s: (s["D"] - s["R"]) / (s["D"] + s["R"]) * 100
        order = sorted((s for s in segs if (s["D"] > s["R"]) == (win == "D")), key=pts, reverse=(win == "D"))
        c, tip = held[win], None
        for s in order:
            c += s["ev"]
            if c >= 270:
                tip = s
                break
        ND, NR = sum(s["D"] for s in segs), sum(s["R"] for s in segs)
        nat_pts, tip_pts = (ND - NR) / (ND + NR) * 100, pts(tip)
        gap = tip_pts - nat_pts
        row = {"year": y, "source": src, "mitNationalVotes": sum(a - b for a, b in mit.values()), "winner": win, "evD": evD, "evR": evR, "heldD": held["D"], "heldR": held["R"],
               "nat": {"D": ND, "R": NR, "votes": ND - NR, "points": round(nat_pts, 4)},
               "tip": {"st": tip["st"], "name": tip["name"], "ev": tip["ev"], "D": tip["D"], "R": tip["R"], "votes": tip["D"] - tip["R"], "points": round(tip_pts, 4), "reached": c},
               "gap": round(gap, 4), "favours": "D" if gap > 0 else "R", "ratio": round(abs(ND - NR) / abs(tip["D"] - tip["R"]), 1)}
        if f"pres{y}" in have:
            row["election"] = f"pres{y}"
        if sim and str(y) in sim["days"] and sim["days"][str(y)].get("pres"):
            p = sim["days"][str(y)]["pres"]
            fx = p["fixedDistricts"]
            assert (fx["D"], fx["R"]) == (held["D"], held["R"]), (y, "held districts differ from simulator.json", fx, held)
            assert (p["actual"]["D"], p["actual"]["R"]) == (evD, evR), (y, "electoral votes differ from simulator.json")
            ss = p["states"]
            sim_tip = sorted(((st, D, R, e) for st, (D, R, e) in ss.items() if (D > R) == (win == "D")), key=lambda t: (t[1] - t[2]) / (t[1] + t[2]), reverse=(win == "D"))
            cc = fx[win]
            for st, D, R, e in sim_tip:
                cc += e
                if cc >= 270:
                    assert st == tip["st"], (y, "tipping state differs from simulator.json", st, tip["st"])
                    break
        out.append(row)
    return out


def main():
    per = {}
    for r in csv.DictReader(open(f"{HIST}/apportionment-by-state-1910-2020.csv")):
        y = int(r["census_year"])
        e = per.setdefault(y, {"year": y, "states": {}})
        if r["state"] == "UNITED STATES":
            e.update(seats=int(r["house_seats"]), population=int(r["resident_population"]), perSeat=int(r["census_published_apportionment_pop_per_rep"]))
        elif r["state"] in STATES and r["house_seats"]:
            e["states"][STATES[r["state"]]] = {"seats": int(r["house_seats"]), "perSeat": int(r["census_published_apportionment_pop_per_rep"] or r["resident_pop_per_seat"])}
    for y, e in per.items():
        assert sum(s["seats"] for s in e["states"].values()) == e["seats"], (y, "state seats do not add to the national row")
        lo = min(e["states"], key=lambda s: e["states"][s]["perSeat"]); hi = max(e["states"], key=lambda s: e["states"][s]["perSeat"])
        e.update(lo=lo, hi=hi)

    small = []
    for r in csv.DictReader(open(f"{HIST}/president-smallest-change-1976-2024.csv")):
        ps = dict((kv.split(":")[0], int(kv.split(":")[1])) for kv in r["per_state"].split("|"))
        small.append({"year": int(r["year"]), "votes": int(r["smallest_change_votes"]), "states": r["states_flipped"].split("|"), "perState": ps,
                      "winnerParty": r["winner_party"], "winner": r["winner_nominee"].title(), "runner": r["runner_up_nominee"].title()})
    weight = []
    pop_by = defaultdict(dict)   # census year -> state -> resident population
    for r in csv.DictReader(open(f"{HIST}/apportionment-by-state-1910-2020.csv")):
        if r["state"] in STATES:
            pop_by[int(r["census_year"])][STATES[r["state"]]] = int(r["resident_population"])
    pres = defaultdict(dict)
    for r in csv.DictReader(open(f"{HIST}/president-by-state-1976-2024-mit.csv")):
        pres[int(r["year"])][r["state_po"]] = (int(r["electoral_votes_allocated"]), int(r["total_votes_reported"]))
    for y in sorted(pres):
        census = 10 * ((y - 2) // 10)
        P = pop_by[census]
        most = max(P, key=P.get); least = min(P, key=P.get)
        ev = {st: e / v for st, (e, v) in pres[y].items()}
        hi = max(ev, key=ev.get); lo = min(ev, key=ev.get)
        assert sum(e for e, _ in pres[y].values()) == 538, (y, "electoral votes do not add to 538")
        weight.append({"year": y, "census": census,
                       "senate": {"big": most, "bigPop": P[most], "small": least, "smallPop": P[least], "ratio": round(P[most] / P[least], 2)},
                       "ev": {"hi": hi, "hiEv": pres[y][hi][0], "hiVotes": pres[y][hi][1], "lo": lo, "loEv": pres[y][lo][0], "loVotes": pres[y][lo][1],
                              "ratio": round(ev[hi] / ev[lo], 2)}})
        if f"pres{y}" in json.load(open(ELECTIONS))["elections"]:
            weight[-1]["election"] = f"pres{y}"

    bias = tipping_vs_nation(f"{HIST}/president-by-state-1976-2024-mit.csv", f"{HIST}/president-smallest-change-1976-2024.csv", ELECTIONS, f"{OUT.rsplit('/', 1)[0]}/simulator.json")
    bal = json.load(open(BALANCE))
    for s in small:
        b = bal["elections"].get(f"pres{s['year']}")
        if b:
            bs = b["smallest"]["president"]
            assert bs["votes"] == s["votes"] and set(bs["states"]) == set(s["states"]), (s["year"], bs["votes"], s["votes"])
            s["election"] = f"pres{s['year']}"   # the page has this election: the bar links to its balance box

    out = {
        "perSeat": [per[y] for y in sorted(per)],
        "cap": CAP,
        "smallest": small,
        "weight": weight,
        "bias": bias,
        "sources": {
            "perSeat": "Census Bureau, 2020 Census apportionment data file (apportionment population per representative, every census 1910-2020), https://www2.census.gov/programs-surveys/decennial/2020/data/apportionment/apportionment.csv",
            "smallest": "MIT Election Data and Science Lab, U.S. President 1976-2024 (doi:10.7910/DVN/42MVDX, CC0), state totals; half each state's margin plus one, the fewest votes that give the runner-up 270 electoral votes (Maine's and Nebraska's district electors held as cast; pledged electors). 2016-2024 agree with the FEC's certified totals.",
            "weight": "Census Bureau, 2020 Census apportionment data file (resident population of the census in force: the last one taken at least two years before the election); MIT Election Data and Science Lab, U.S. President 1976-2024 (doi:10.7910/DVN/42MVDX, CC0), total votes and electoral votes by state. Residents per senator: most populous state against least. Electoral votes per vote cast: electoral votes divided by total presidential votes, the highest state (or DC) against the lowest.",
            "bias": "MIT Election Data and Science Lab, U.S. President 1976-2024 (doi:10.7910/DVN/42MVDX, CC0), state totals, with the FEC's certified totals for 2016-2024 (the ones the balance box and Road to 270 use); electoral votes from the Census Bureau apportionment file for the census in force. States ordered by two-party margin, the winner's strongest first, until 270 electoral votes: the state that reaches 270 is the tipping state. Maine's and Nebraska's district electors are held as cast, outside the ordering. National margin: the states' totals summed, two nominees only.",
            "starts": "The series start where the gathered data starts: apportionment in 1910, presidential results in 1976.",
        },
    }
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    for e in out["perSeat"]:
        print(e["year"], e["seats"], e["perSeat"], "lowest", e["lo"], e["states"][e["lo"]]["perSeat"], "highest", e["hi"], e["states"][e["hi"]]["perSeat"])
    for s in small:
        print(s["year"], s["votes"], ",".join(s["states"]), s.get("election", ""))
    for b in bias:
        print(b["year"], b["tip"]["st"], b["tip"]["points"], b["nat"]["points"], b["gap"], b["nat"]["votes"], b["ratio"], b["source"], b["mitNationalVotes"])
    for w in weight:
        print(w["year"], "census", w["census"], "senate", w["senate"]["big"], w["senate"]["small"], w["senate"]["ratio"],
              "ev/vote", w["ev"]["hi"], w["ev"]["lo"], w["ev"]["ratio"], w.get("election", ""))


if __name__ == "__main__":
    main()
