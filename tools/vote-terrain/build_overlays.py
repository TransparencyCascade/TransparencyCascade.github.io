"""Overlays from our own research for the vote-terrain page: which counties hold a place a layer marks.

    /usr/bin/python3 -I build_overlays.py <detention-pipeline repo> static/maps/vote-terrain/overlays.json

Layers (one county set each; the page draws them and compares the counties' swing with matched counties):
  monitors   DOJ election monitors, Nov. 3, 2026: the counties holding a jurisdiction on DOJ's Election Day list,
             as joined by the monitors microsite (static/monitors/data.json, built by tools/monitors/analyze.py from
             tools/monitors/inputs/doj-nov-3-2026-election-monitor-jurisdictions.csv). A listed city counts as the
             county that holds it. Places outside the county map (Alaska) are listed, not drawn.
  detention  ICE detention facilities, fiscal 2026: the counties holding a facility that held an average of at
             least MIN_ADP people a day in fiscal 2026 to the date of the file, from the detention-pipeline site's
             facility entries (kb/facilities/*.md, avg_daily_pop), which take the figure from the Vera Institute's
             ICE Detention Trends FY2026 file.
Every figure comes from those files; nothing is typed in except MIN_ADP, the layer's stated rule.
"""
import glob
import json
import os
import re
import subprocess
import sys

DP, OUT = sys.argv[1:3]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
VT = os.path.dirname(os.path.abspath(OUT))
MIN_ADP = 10

geo_meta = json.load(open(os.path.join(VT, "geometry.json")))["meta"]
# Alaska's boroughs are in the geometry but carry no county votes (Alaska reports by House district), so its places
# are listed with the layer, not drawn or compared.
on_map = {m[0] for m in geo_meta if m[2] != "AK"}


def git_date(repo, path, change=None):
    """The date of the last commit touching path (or, with change, the last that added or removed that string there)."""
    pick = ["-S" + change] if change else []
    return subprocess.run(["git", "-C", repo, "log", "-1", *pick, "--format=%cs", "--", path], capture_output=True, text=True).stdout.strip()


# ---------- DOJ monitors ----------
mon = json.load(open(os.path.join(ROOT, "static/monitors/data.json")))
csv_path = os.path.join(ROOT, "tools/monitors/inputs/doj-nov-3-2026-election-monitor-jurisdictions.csv")
csv_rows = open(csv_path).read().splitlines()[1:]
release = re.search(r'"(https://www\.justice\.gov/[^ "]+)', csv_rows[0]).group(1)
read_utc = csv_rows[0].rsplit(",", 1)[1]
assert len(csv_rows) == len(mon["rows"]), (len(csv_rows), len(mon["rows"]))
m_counties, m_off = {}, []
for r in mon["rows"]:
    label = r["j"] if r["kind"] == "county" else f'{r["j"]} ({r["kind"]})'
    if r.get("fips") in on_map:
        m_counties.setdefault(r["fips"], []).append(label)
    else:
        m_off.append(f'{r["j"]}, {r["st"]}')
monitors = {
    "name": "DOJ election monitors, Nov. 3, 2026",
    "short": "DOJ monitors",
    "item": "monitored place",
    "rule": "Counties holding a jurisdiction on the Justice Department's Nov. 3, 2026 Election Day monitoring list; a listed city counts as the county that holds it.",
    "source": f"U.S. Department of Justice, press release 26-1310, {release} (read {read_utc}); joined to counties by the Transparency Cascade monitors page, transparencycascade.org/monitors.",
    "asof": mon["read"],
    "jurisdictions": len(mon["rows"]),
    "counties": {f: sorted(v) for f, v in sorted(m_counties.items())},
    "offMap": m_off,
    "election": "sen2026",
}

# ---------- ICE detention facilities ----------
facs, seen = {}, 0
for p in sorted(glob.glob(os.path.join(DP, "kb/facilities/*.md"))):
    fm = open(p).read().split("---")[1]
    g = lambda k: (re.search(rf'^{k}:\s*"?([^"\n]*)"?\s*$', fm, re.M) or [None, ""])[1].strip()
    adp = g("avg_daily_pop")
    if not adp.isdigit() or g("status") != "active":
        continue
    seen += 1
    if int(adp) < MIN_ADP:
        continue
    f = g("fips").zfill(5) if g("fips") else ""
    facs.setdefault(f, []).append([g("facility_name"), int(adp), g("facility_type")])
d_counties = {f: sorted(v, key=lambda x: -x[1]) for f, v in sorted(facs.items()) if f in on_map}
d_off = [f"{n} ({f or 'no county code'})" for f, v in facs.items() if f not in on_map for n, *_ in v]
# The population figures date from the last commit that wrote avg_daily_pop into the entries.
ADP_DATE = git_date(DP, "kb/facilities", "avg_daily_pop")
detention = {
    "name": f"ICE detention facilities, fiscal 2026 (average of {MIN_ADP}+ a day)",
    "short": "ICE detention",
    "item": "facility",
    "rule": f"Counties holding a facility that held an average of at least {MIN_ADP} people a day in fiscal 2026 (from Oct. 1, 2025) to the date of the figures.",
    "source": "Vera Institute of Justice, ICE Detention Trends, fiscal 2026 facility file (github.com/vera-institute/ice-detention-trends), "
              f"as imported to the detention-pipeline site's facility entries on {ADP_DATE} (detention-pipeline.transparencycascade.org).",
    "asof": ADP_DATE,
    "minAdp": MIN_ADP,
    "facilities": sum(len(v) for v in d_counties.values()),
    "withFigure": seen,
    "counties": d_counties,
    "offMap": d_off,
    "election": "sen2026",
}

out = {
    "layers": {"monitors": monitors, "detention": detention},
    "bands": {
        "lean": "the county's margin in the baseline race: Democrat ahead; Republican ahead by 0-20, 20-40, or 40 or more points",
        "size": "the county's votes in the baseline race: under 10,000; 10,000-50,000; 50,000-200,000; 200,000 or more",
    },
}
json.dump(out, open(OUT, "w"), separators=(",", ":"))
for k, L in out["layers"].items():
    print(k, len(L["counties"]), "counties on the map;", len(L["offMap"]), "off the map:", L["offMap"][:6])
