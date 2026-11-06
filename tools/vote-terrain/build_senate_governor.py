"""County results for the Senate and governor tracks of the vote-terrain page.

    /usr/bin/python3 -I build_senate_governor.py <workdir> <out.json>

<workdir> holds the downloads (see SOURCES below); writes one JSON with, per election, a county map
fips -> [total votes, Republican votes, Democratic votes] plus label, source, notes and checks.
build_data.mjs merges it into elections.json.

Rules, every election:
  - one race per state: the regular race; a state whose only race that year was a special (Arizona
    2020) uses the special. Second races on the same ballot (Georgia 2020 special, Minnesota and
    Mississippi 2018 specials, Oklahoma and California 2022 unexpired terms, Nebraska 2024 special)
    are left out and listed in the notes;
  - Republican and Democratic votes are those of the state's leading Republican and leading
    Democrat (statewide), so all-candidate primaries (Louisiana) compare the two leading candidates;
    total = every candidate's votes;
  - a state without both a Democrat and a Republican on the ballot is left out (no data), listed;
  - precinct files: votes summed by candidate across party lines (fusion counted once); per precinct,
    a TOTAL mode row counts as a duplicate only when it equals the sum of the precinct's other modes
    (Delaware reports TOTAL as its own category); Minnesota's DFL line counts as Democratic.
"""

import csv
import io
import json
import os
import sys
import zipfile
from collections import defaultdict

NONVOTE = {"OVERVOTES", "UNDERVOTES", "OVER VOTES", "UNDER VOTES", "BLANK", "BLANKS", "SPOILED", "UNDERVOTE",
           "OVERVOTE", "BLANK VOTES", "TOTAL VOTES", "TOTAL VOTES CAST", "REGISTERED VOTERS", "WRITEIN", "WRITE-IN"}
csv.field_size_limit(10 ** 9)


def party(row):
    p = (row.get("party_simplified") or "").upper()
    d = (row.get("party_detailed") or row.get("party") or "").upper()
    if p in ("DEMOCRAT", "REPUBLICAN"):
        return p
    if ("FARMER" in d and "LABOR" in d) or d == "DFL" or d.startswith("DEMOCRAT"):
        return "DEMOCRAT"
    if "REPUBLICAN" in d or d == "GOP":         # includes "Prefers Republican Party" and "GOP"
        return "REPUBLICAN"
    if "DEMOCRAT" in d:
        return "DEMOCRAT"
    return None


def fips5(v):
    v = (v or "").strip().split(".")[0]
    return v.zfill(5) if v.isdigit() else ""


def from_precincts(rows, office="US SENATE"):
    """rows: iterable of MEDSL precinct dicts for one state. Returns (county -> cand -> votes, cand -> party, specials seen)."""
    # (special, county, precinct) -> mode -> cand -> votes
    acc = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    parties = defaultdict(set)
    for r in rows:
        if r["office"].upper() != office or r["stage"].upper() != "GEN":
            continue
        cand = r["candidate"].strip().upper()
        if not cand or cand in NONVOTE:
            continue
        try:
            v = int(float(r["votes"]))
        except ValueError:
            continue
        sp = r.get("special", "FALSE").upper()
        f = fips5(r.get("county_fips"))
        acc[(sp, f, r.get("precinct", ""))][r.get("mode", "TOTAL").upper()][cand] += v
        p = party(r)
        if p:
            parties[(sp, cand)].add(p)
    out = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))   # special -> county -> cand -> votes
    for (sp, f, _), modes in acc.items():
        use = modes
        if "TOTAL" in modes:
            tot = sum(modes["TOTAL"].values())
            rest = sum(v for m, c in modes.items() if m != "TOTAL" for v in c.values())
            if rest == 0 or abs(tot - rest) <= max(2, rest // 100):
                use = {"TOTAL": modes["TOTAL"]}
        for c in use.values():
            for cand, v in c.items():
                out[sp][f][cand] += v
    return out, parties


def pick_race(by_special, parties):
    """Regular race if present, else the special. Returns (special flag, county->cand->votes, cand->party)."""
    sp = "FALSE" if "FALSE" in by_special else ("TRUE" if "TRUE" in by_special else None)
    if sp is None:
        return None, None, None
    cp = {c: ps for (s, c), ps in parties.items() if s == sp}
    return sp, by_special[sp], cp


def to_records(counties, cand_party):
    """Leading Republican and Democrat statewide; returns (fips -> [t, r, d], rep name, dem name) or None."""
    tot = defaultdict(int)
    for c in counties.values():
        for cand, v in c.items():
            tot[cand] += v
    reps = [c for c in tot if "REPUBLICAN" in cand_party.get(c, ())]
    dems = [c for c in tot if "DEMOCRAT" in cand_party.get(c, ()) and c not in reps]
    if not reps or not dems:
        return None, (max(reps, key=tot.get) if reps else ""), (max(dems, key=tot.get) if dems else "")
    rc, dc = max(reps, key=tot.get), max(dems, key=tot.get)
    recs = {}
    for f, c in counties.items():
        if not f:
            continue
        recs[f] = [sum(c.values()), c.get(rc, 0), c.get(dc, 0)]
    return recs, rc, dc


def fec_tops(path):
    """FEC 'US Senate Results by State' sheet dumped by xlsx_sheet.py: state -> {'R': votes, 'D': votes} for the
    regular race (district 'S' or 'S-FULL TERM'), leading candidate of each party by general-election votes."""
    out = defaultdict(lambda: {"R": 0, "D": 0})
    for r in csv.DictReader(open(path)):
        st, dist, p = r.get("B", ""), (r.get("D") or "").strip().upper(), (r.get("K") or "").strip().upper()
        if not (len(st) == 2 and st.isupper() and dist in ("S", "S-FULL TERM")):
            continue
        try:
            v = int(float(r.get("P") or 0))
        except ValueError:
            continue
        key = "R" if p == "R" else "D" if p in ("D", "DFL", "DEM") else None
        if key and v > out[st][key]:
            out[st][key] = v
    return out


def check(recs_by_state, fec):
    exact, close, off, bad = [], [], [], []
    for st, recs in sorted(recs_by_state.items()):
        if st not in fec:
            continue
        r = sum(v[1] for v in recs.values()); d = sum(v[2] for v in recs.values())
        fr, fd = fec[st]["R"], fec[st]["D"]
        if not (fr and fd):
            continue
        er, ed = abs(r - fr) / fr, abs(d - fd) / fd
        if r == fr and d == fd:
            exact.append(st)
        elif max(er, ed) <= 0.005:
            close.append(f"{st} (R {r - fr:+,}, D {d - fd:+,})")
        else:
            off.append(f"{st} (R {r - fr:+,} = {er:.1%}, D {d - fd:+,} = {ed:.1%})")
            if max(er, ed) > 0.05 and st not in FUSION:
                bad.append(st)
    return {"exact": exact, "within_0.5pct": close, "off": off, "dropped": bad}


# States where the FEC table counts party lines and this file counts each candidate across all lines.
FUSION = {"NY", "CT"}


def senate_precinct_year(year, files_for_state, states, fec_csv):
    data, by_state, notes = {}, {}, []
    for st in states:
        f = files_for_state(st)
        if not f:
            notes.append(f"{st}: no precinct file")
            continue
        rows = f()
        by_sp, parties = from_precincts(rows)
        if "FALSE" in by_sp and "TRUE" in by_sp:
            notes.append(f"{st}: special election on the same ballot left out")
        sp, counties, cp = pick_race(by_sp, parties)
        if sp is None:
            notes.append(f"{st}: no U.S. Senate rows in the precinct file")
            continue
        if sp == "TRUE":
            notes.append(f"{st}: the year's only Senate race was a special; used")
        recs, rc, dc = to_records(counties, cp)
        if recs is None:
            notes.append(f"{st}: no Democrat-vs-Republican race (Republican {rc or 'none'}, Democrat {dc or 'none'}); no data")
            continue
        by_state[st] = recs
        data.update(recs)
    checks = check(by_state, fec_tops(fec_csv)) if fec_csv else None
    # A state whose precinct file is more than 5 percent off the certified totals (and not explained by
    # fusion) is left out rather than shown wrong.
    for st in (checks or {}).get("dropped", []):
        for f in by_state[st]:
            data.pop(f, None)
        notes.append(f"{st}: precinct file more than 5 percent off the FEC certified totals; left out")
    return data, notes, checks


def read_csv_file(path):
    return lambda: csv.DictReader(open(path, newline="", encoding="utf-8", errors="replace"))


def read_zip(path):
    def it():
        z = zipfile.ZipFile(path)
        name = next(n for n in z.namelist() if n.endswith(".csv"))
        return csv.DictReader(io.TextIOWrapper(z.open(name), encoding="utf-8", errors="replace"))
    return it


def main(work, out):
    W = lambda *p: os.path.join(work, *p)
    res = {}

    # ---------- Senate 2018: county table already built from MEDSL 2018 precinct files ----------
    t2018 = os.path.expanduser("~/tcp-kb-internal/cascade-research/notes/data/medsl-2018-county-senate-governor-house.csv")
    for off, key, label, src in (
            ("S", "sen2018", "Senate 2018", "MIT Election Data and Science Lab, Precinct-Level Returns 2018 (doi:10.7910/DVN/NVQYMG), summed to counties (medsl-2018-county-senate-governor-house.csv). Statewide Republican and Democratic sums match the FEC 2018 compilation within 0.05 percent in 27 of 33 states; Indiana and New Jersey run about 1.5 percent short; Connecticut and New York count candidates across fusion lines."),
            ("G", "gov2018", "Governor 2018", "MIT Election Data and Science Lab, Precinct-Level Returns 2018 (doi:10.7910/DVN/NVQYMG), summed to counties (medsl-2018-county-senate-governor-house.csv). Not checked against certified state totals.")):
        data, notes, states = {}, [], set()
        rows = [r for r in csv.DictReader(open(t2018)) if r["office"] == off and r["district"] == ""]
        specials = {r["state"] for r in rows if r["special"] == "TRUE"}
        for st in sorted({r["state"] for r in rows}):
            rs = [r for r in rows if r["state"] == st]
            reg = [r for r in rs if r["special"] == "FALSE"] or rs
            if st in specials and any(r["special"] == "FALSE" for r in rs):
                notes.append(f"{st}: special election on the same ballot left out")
            if all(int(r["n_rep"]) == 0 for r in reg) or all(int(r["n_dem"]) == 0 for r in reg):
                notes.append(f"{st}: no Democrat-vs-Republican race; no data")
                continue
            for r in reg:
                f = fips5(r["county_fips"])
                if f:
                    data[f] = [int(r["votes_total"]), int(r["rep_top"]), int(r["dem_top"])]
                    states.add(st)
        res[key] = {"label": label, "office": "U.S. Senate" if off == "S" else "Governor", "year": 2018, "data": data,
                    "source": src, "notes": notes, "states": sorted(states)}

    # ---------- Senate 2020: MEDSL 2020 precinct files ----------
    d2020 = "/Users/markr/Downloads/dataverse_files (1)"
    s2020 = ["AK", "AL", "AR", "AZ", "CO", "DE", "GA", "IA", "ID", "IL", "KS", "KY", "LA", "MA", "ME", "MI", "MN", "MS",
             "MT", "NC", "NE", "NH", "NJ", "NM", "OK", "OR", "RI", "SC", "SD", "TN", "TX", "VA", "WV", "WY"]

    def f2020(st):
        for n in (f"2020-{st.lower()}-precinct-general.csv", f"2020_{st.lower()}_precinct_general.csv"):
            p = os.path.join(d2020, n)
            if os.path.exists(p):
                return read_csv_file(p)
        return None
    data, notes, checks = senate_precinct_year(2020, f2020, [s for s in s2020 if s != "AK"], W("s2020.csv"))
    notes.insert(0, "AK: reports by state House district, no county data")
    res["sen2020"] = {"label": "Senate 2020", "office": "U.S. Senate", "year": 2020, "data": data, "notes": notes, "checks": checks,
                      "source": "MIT Election Data and Science Lab, Precinct-Level Returns 2020 by Individual State (doi:10.7910/DVN/NT66Z3), summed to counties; checked against the FEC 2020 compilation (federalelections2020.xlsx, US Senate Results by State)."}

    # ---------- Senate 2022: MEDSL 2022-elections-official GitHub zips ----------
    s2022 = ["AL", "AR", "AZ", "CA", "CO", "CT", "FL", "GA", "HI", "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MD", "MO",
             "NC", "ND", "NH", "NV", "NY", "OH", "OK", "OR", "PA", "SC", "SD", "UT", "VT", "WA", "WI"]
    f2022 = lambda st: (read_zip(W(f"2022-{st.lower()}-local-precinct-general.zip")) if os.path.exists(W(f"2022-{st.lower()}-local-precinct-general.zip")) else None)
    data, notes, checks = senate_precinct_year(2022, f2022, s2022, W("s2022.csv"))
    notes.insert(0, "AK: reports by state House district, no county data")
    res["sen2022"] = {"label": "Senate 2022", "office": "U.S. Senate", "year": 2022, "data": data, "notes": notes, "checks": checks,
                      "source": "MIT Election Data and Science Lab, 2022-elections-official (GitHub), precinct files summed to counties; checked against the FEC 2022 compilation (federalelections2022.xlsx, US Senate Results by State)."}

    # ---------- Senate 2024: MEDSL county file (marked unofficial where MEDSL says so) ----------
    rows = list(csv.DictReader(open(W("2024-senate-county.csv"), newline="")))
    by_st = defaultdict(list)
    for r in rows:
        by_st[r["state_po"]].append(r)
    data, notes, unofficial = {}, [], set()
    for st, rs in sorted(by_st.items()):
        if st == "AK":
            notes.append("AK: reports by state House district, no county data")
            continue
        # county-level file: treat each county as one precinct for the TOTAL rule
        pre = [dict(r, precinct=r["county_fips"]) for r in rs]
        by_sp, parties = from_precincts(pre)
        if "FALSE" in by_sp and "TRUE" in by_sp:
            notes.append(f"{st}: special election on the same ballot left out")
        sp, counties, cp = pick_race(by_sp, parties)
        if sp is None:
            continue
        recs, rc, dc = to_records(counties, cp)
        if recs is None:
            notes.append(f"{st}: no Democrat-vs-Republican race (Republican {rc or 'none'}, Democrat {dc or 'none'}); no data")
            continue
        if any(r["unofficial"].upper() == "TRUE" for r in rs):
            unofficial.add(st)
        data.update(recs)
    if unofficial:
        notes.append("Marked unofficial by MEDSL: " + ", ".join(sorted(unofficial)))
    res["sen2024"] = {"label": "Senate 2024", "office": "U.S. Senate", "year": 2024, "data": data, "notes": notes,
                      "source": "MIT Election Data and Science Lab, 2024-elections-official (GitHub), 2024-senate-county.csv; some states marked unofficial by MEDSL (listed in the notes)."}

    # ---------- Governor 2026 and the prior governor race: the checked county file ----------
    PULL = "2026-11-05T1646Z"      # keep equal to PULL in build_data.mjs: one pull for Senate, governor and House
    gpath = os.path.expanduser("~/tcp-kb-internal/cascade-research/notes/data/governor-2026-vs-pres24-vs-prior-governor-by-county-unofficial-" + PULL + ".csv")
    g26, gprior, g22, priorYears = {}, {}, {}, {}
    for r in csv.DictReader(open(gpath)):
        st, f = r["state"], fips5(r["county_fips"])
        if st == "AK" or not f:
            continue
        if r["counted"] == "yes" and r["flag_2026_not_dem_vs_rep"] == "no" and r["total_2026"]:
            g26[f] = [int(float(r["total_2026"])), int(float(r["votes_rep_2026"])), int(float(r["votes_dem_2026"]))]
        if r["flag_prior_not_dem_vs_rep"] == "no" and r["prior_total"] and float(r["prior_total"]) > 0:
            rec = [int(float(r["prior_total"])), int(float(r["prior_votes_rep"])), int(float(r["prior_votes_dem"]))]
            gprior[f] = rec
            priorYears[st] = r["prior_year"]
            if r["prior_year"] == "2022":
                g22[f] = rec
    res["gov2026"] = {"label": "Governor 2026", "office": "Governor", "year": 2026, "data": g26, "unofficial": True,
                      "notes": ["Democrat-vs-Republican races only; Alaska reports by state House district and is left out."],
                      "source": "AP county results via CNN (county-races/2026-GG-<state>.json), unofficial as of 11:46 a.m. ET, Nov. 5, 2026, the same pull as the Senate and House files; county rows checked to sum to each race total (governor-2026-vs-pres24-vs-prior-governor-by-county-unofficial-" + PULL + ".csv)."}
    res["gov2022"] = {"label": "Governor 2022", "office": "Governor", "year": 2022, "data": g22,
                      "notes": ["The 34 states whose 2026 governor's seat was last filled in 2022; New Hampshire and Vermont (two-year terms) are not in this file for 2022."],
                      "source": "Prior-race columns of the county governor file: MIT Election Data and Science Lab 2022 precinct files summed to counties, Tennessee from OpenElections (see senate-and-governor-2026-vs-prior-race-by-county-2026-11-04.md); checked against MEDSL statewide totals only."}
    res["govprior"] = {"label": "the previous governor's race", "office": "Governor", "data": gprior, "baselineOnly": True, "priorYears": priorYears,
                       "source": "Previous governor's race by county (2022, or 2024 in New Hampshire and Vermont): see senate-and-governor-2026-vs-prior-race-by-county-2026-11-04.md."}

    for k2, e in res.items():
        print(k2, len(e["data"]), "counties;", e.get("checks") or "", "| notes:", "; ".join(e.get("notes", []))[:400])
    json.dump(res, open(out, "w"))


if __name__ == "__main__":
    main(*sys.argv[1:3])
