"""The swing simulator's races: every state's presidential vote, every Senate race with the seats not on the
ballot, for each election day the page has; the House comes from house.json at run time.

    /usr/bin/python3 -I build_simulator.py <downloads> static/maps/vote-terrain/balance.json static/maps/vote-terrain/simulator.json

<downloads> is the same directory build_balance.py reads (its docstring lists the files). Nothing is typed in
except the party of two Mississippi candidates whose 2018 special election was nonpartisan on the ballot
(PARTY_BY_FEC_ID, each with the FEC candidate page it comes from).

Per election day:
  pres    President (2016, 2020, 2024): each state's certified Democratic and Republican totals (FEC, as the
          smallest change uses) and its electoral votes. Maine's and Nebraska's district electors are held at
          their actual results; their two at-large electors move with the statewide vote.
  senate  Each race's top Democratic-side and top Republican candidate (independents who caucus with the
          Democrats count as Democrats; fusion lines merged by name), the seats not on the ballot, and the
          chamber after the election. A race is held at its actual result when its top two are not a
          Democrat against a Republican (California's two Democrats, Alaska's two Republicans, Utah 2022,
          Nebraska 2024) or when the two-way count would not give its actual winner.
  vp      Who breaks a 50-50 Senate tie: in a presidential year, the simulated president's party; otherwise the
          vice president then in office, read from balance.json's smallest-change labels.
Checks: at no swing, the electoral votes equal each year's pledged result and the Senate equals the chamber
the party division page shows after that election. 2026 is unofficial (AP via CNN), labelled with its time.
"""
import importlib.util
import json
import sys
from collections import defaultdict

D_DIR, BAL, OUT = sys.argv[1:4]
sys.dont_write_bytecode = True                     # importing build_balance below leaves no __pycache__ behind
_here = __file__.rsplit("/", 1)[0]
sys.argv = ["build_balance.py", D_DIR, "/dev/null", "/dev/null", "/dev/null"]
_spec = importlib.util.spec_from_file_location("build_balance", f"{_here}/build_balance.py")
bb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bb)

bal = json.load(open(BAL))

# Nonpartisan on the ballot (Mississippi's 2018 special election); party from each candidate's FEC page.
PARTY_BY_FEC_ID = {
    "Hyde-Smith, Cindy": ("R", "https://www.fec.gov/data/candidate/S8MS00261/"),
    "Espy, Mike": ("D", "https://www.fec.gov/data/candidate/S8MS00287/"),
}


def side_of(name, party):
    p = party.upper().replace("*", "").strip()
    if name in PARTY_BY_FEC_ID:
        return PARTY_BY_FEC_ID[name][0]
    if p.startswith("COMBINED"):
        return None                                   # a total line, not a candidate
    if p in ("D", "DEM", "DFL", "DNL") or p.startswith(("D/", "D-", "DEM")) or "(D)" in p or p.endswith("/D"):
        return "D"
    if p in ("R", "REP") or p.startswith(("R/", "R-", "REP")):
        return "R"
    return "D" if any(n in name.upper() for n in bb.CAUCUS_D) else "other"


def clean(name):
    return " ".join(name.replace("#", "").replace("*", "").split())


def race_list(races):
    """[{st, key, D, R, dName, rName, win, fixed, why}] from build_balance's race dicts."""
    out = []
    for (st, race), cs in sorted(races.items()):
        merged = {}
        for c in cs:
            s = side_of(clean(c["name"]), c["party"])
            if s is None:
                continue
            n = clean(c["name"])
            m = merged.setdefault(n, {"name": n, "votes": 0, "side": "other", "won": False})
            m["votes"] = max(m["votes"], c["votes"])     # fusion lines repeat the combined total, or split it
            m["won"] = m["won"] or c["won"]
            if s != "other":
                m["side"] = s
        cand = sorted(merged.values(), key=lambda c: -c["votes"])
        if len(cand) < 2 and not (cand and cand[0]["won"]):
            continue                                      # a stray line (write-ins only)
        win = next((c for c in cand if c["won"]), cand[0])
        topD = next((c for c in cand if c["side"] == "D"), None)
        topR = next((c for c in cand if c["side"] == "R"), None)
        r = {"st": st, "key": race.strip().upper(), "win": win["side"] if win["side"] != "other" else "other",
             "winner": win["name"], "D": topD["votes"] if topD else 0, "R": topR["votes"] if topR else 0,
             "dName": topD["name"] if topD else None, "rName": topR["name"] if topR else None}
        top2 = [c["side"] for c in cand[:2]]
        if sorted(top2) != ["D", "R"]:
            r["fixed"], r["why"] = r["win"], "top two were not a Democrat against a Republican"
        elif (r["D"] > r["R"]) != (r["win"] == "D"):
            r["fixed"], r["why"] = r["win"], "the two-way count does not give the actual winner"
        out.append(r)
    # Two races in one state: the second is the special (unexpired term).
    seen = defaultdict(int)
    for r in sorted(out, key=lambda r: (r["st"], "UNEXPIRED" in r["key"] or "SPECIAL" in r["key"])):
        seen[r["st"]] += 1
        r["id"] = r["st"] if seen[r["st"]] == 1 else r["st"] + "-special"
        del r["key"]
    return sorted(out, key=lambda r: r["id"])


def ap_2026():
    sg = json.load(open(f"{D_DIR}/sg2026.json"))
    out = []
    for r in sg:
        cs = sorted(r["candidates"], key=lambda c: -c["voteNum"])
        side = lambda c: "D" if c["majorParty"] == "DEM" else "R" if c["majorParty"] == "REP" else "other"
        topD = next((c for c in cs if side(c) == "D"), None)
        topR = next((c for c in cs if side(c) == "R"), None)
        w = next((c for c in cs if c.get("winner")), cs[0])
        e = {"st": r["stateAbbreviation"], "id": r["stateAbbreviation"] + ("-special" if r["ecKey"].split("-")[1] == "SP" else ""),
             "win": side(w), "winner": w["fullName"], "called": r["status"] == "W" and bool(w.get("winner")),
             "D": topD["voteNum"] if topD else 0, "R": topR["voteNum"] if topR else 0,
             "dName": topD["fullName"] if topD else None, "rName": topR["fullName"] if topR else None}
        if sorted(side(c) for c in cs[:2]) != ["D", "R"]:
            e["fixed"], e["why"] = e["win"], "top two were not a Democrat against a Republican"
        out.append(e)
    return sorted(out, key=lambda r: r["id"])


def pres_day(year, key):
    tot = bb.state_pres(year)
    cast = bb.archives_table(year)
    ev = bal["ev"][key]
    first_party = {2016: "R", 2020: "D", 2024: "D"}[year]   # the archives table lists this nominee first (as build_balance)
    states, fixed = {}, {"D": 0, "R": 0}
    for st, n in ev.items():
        d, r = tot[st]["D"], tot[st]["R"]
        if st in ("ME", "NE"):
            c = cast[st]
            dist = {first_party: c[1], ("D" if first_party == "R" else "R"): c[2]}
            dist["D" if d > r else "R"] -= 2              # the two at-large electors went to the statewide winner
            fixed["D"] += dist["D"]; fixed["R"] += dist["R"]
            states[st] = [d, r, 2]
        else:
            states[st] = [d, r, n]
    evD = fixed["D"] + sum(e for d, r, e in states.values() if d > r)
    evR = fixed["R"] + sum(e for d, r, e in states.values() if r > d)
    # Pledged electors (the state results); 2016 had seven faithless electors, so the cast count differs.
    want = {"D": sum(cast[s][1] if first_party == "D" else cast[s][2] for s in cast), "R": sum(cast[s][1] if first_party == "R" else cast[s][2] for s in cast)}
    assert evD + evR == 538, (year, evD, evR)
    print(f"pres {year}: pledged D {evD}, R {evR}; archives cast D {want['D']}, R {want['R']}")
    return {"states": states, "fixedDistricts": fixed, "actual": {"D": evD, "R": evR},
            "note": "Maine's and Nebraska's district electors held at their actual results; electoral votes as pledged by the state results"
                    + (" (seven electors voted otherwise in 2016)" if year == 2016 else "") + ".",
            "source": bal["elections"][key]["smallest"]["president"]["source"]}


def senate_day(races, after, source, vp, unofficial=None, holdover=None):
    wonD = sum(1 for r in races if r["win"] == "D")
    wonR = sum(1 for r in races if r["win"] == "R")
    if holdover is None:
        holdover = {"D": after["caucusD"] - wonD, "R": after["R"] - wonR}
    total = holdover["D"] + holdover["R"] + len(races)
    assert total == 100, (source, holdover, len(races), wonD, wonR)
    actual = {"D": holdover["D"] + wonD, "R": holdover["R"] + wonR}
    return {"races": races, "holdover": holdover, "actual": actual, "vp": vp, "source": source, **({"unofficial": unofficial} if unofficial else {})}


def main():
    E = bal["elections"]
    S = bal["sources"]
    r16 = race_list(bb.fec_senate(f"{D_DIR}/fec2016.xlsx", "US Senate Results"))
    r18 = race_list(bb.fec_senate(f"{D_DIR}/fec2018.xlsx", "US Senate Results"))
    r20 = race_list(bb.fec_senate(f"{D_DIR}/fec2020.xlsx", "US Senate Results"))
    r22 = race_list(bb.fec_senate(f"{D_DIR}/fec2022.xlsx", "US Senate Results"))
    r24 = race_list(bb.medsl_2024_senate())
    r26 = ap_2026()
    s26 = E["sen2026"]["senate"]
    # The tie-breaking vice president in a midterm, from balance.json's own labels (no names typed here).
    vp = lambda label: "R" if "vice president was a Republican" in label or "vice president is a Republican" in label else "D" if "vice president was a Democrat" in label else None
    vp18, vp22, vp26 = vp(E["d2018"]["smallest"]["senate"]["label"]), vp(E["d2022"]["smallest"]["senate"]["label"]), vp(E["pres2024"]["smallest"]["senate"]["label"])
    assert None not in (vp18, vp22, vp26)
    days = {
        "2016": {"pres": pres_day(2016, "pres2016"), "senate": senate_day(r16, E["pres2016"]["senate"], S["fec2016"], "pres")},
        "2018": {"senate": senate_day(r18, E["d2018"]["senate"], S["fec2018"], vp18)},
        "2020": {"pres": pres_day(2020, "pres2020"), "senate": senate_day(r20, E["pres2020"]["senate"], S["fec2020"] + " (Georgia's Jan. 5, 2021 runoffs)", "pres")},
        "2022": {"senate": senate_day(r22, E["d2022"]["senate"], S["fec2022"], vp22)},
        "2024": {"pres": pres_day(2024, "pres2024"), "senate": senate_day(r24, E["pres2024"]["senate"], S["medsl2024sen"] + " (unofficial file version)", "pres")},
        "2026": {"senate": senate_day(r26, None, S.get("cnn_sen", "https://politics.api.cnn.io/results/national-races/2026-SG.json"), vp26,
                                      unofficial=E["sen2026"]["unofficial_asof"], holdover=s26["holdover"])},
    }
    # The source file for 2024 has no row for Nebraska's special election: that seat stays with the seats not up.
    if not any(r["id"].startswith("NE-") for r in r24):
        days["2024"]["senate"]["note"] = "Nebraska's special election is not in the 2024 Senate source file, so that seat is held with the seats not on the ballot."
    # The chamber at no swing must be the chamber after each election (2026: called plus leading races).
    for y, key in (("2016", "pres2016"), ("2018", "d2018"), ("2020", "pres2020"), ("2022", "d2022"), ("2024", "pres2024")):
        a, want = days[y]["senate"]["actual"], E[key]["senate"]
        assert a == {"D": want["caucusD"], "R": want["R"]}, (y, a, want)
    for y, d in days.items():
        held = [r["id"] for r in d["senate"]["races"] if r.get("fixed")]
        print(f"senate {y}: actual {d['senate']['actual']}, holdover {d['senate']['holdover']}, races {len(d['senate']['races'])}, held at actual: {held}")
    out = {"days": days,
           "partySources": {n: u for n, (_, u) in PARTY_BY_FEC_ID.items()},
           "rules": {
               "uniform": "Uniform swing: every place's margin moves by the same number of points.",
               "proportional": "Proportional swing: the losing side's share falls by the same fraction everywhere, so places where it is strong lose more points.",
               "swing": "Swing is in points of the two-party margin: 2 points of margin is 1 voter in 100 changing sides.",
           }}
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
