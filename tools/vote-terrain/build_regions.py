#!/usr/bin/env python3 -I
"""Preset regions for the close-up drawer: static/maps/vote-terrain/regions.json.

    python3 -I tools/vote-terrain/build_regions.py static/maps/vote-terrain

Each region lists its county codes (five-digit FIPS, resolved from county names in geometry.json) and the definition
the page prints. Checks: every named county is found exactly once, and the count matches the definition.

No USDA or Census Bureau definition of either "Rio Grande border counties" or "the Black Belt" was found (searched
2026-11-05), so each region states the rule used. For the border, the 1983 La Paz Agreement defines a border area of 100 km
either side of the line (44 U.S. counties per the HHS Border Health Commission); no county-by-county list came with it,
so it is not used. For the Black Belt, no single multi-state list is cited here; the Alabama counties below are the
region's historical list and the page says so."""
import json, sys, os
root = sys.argv[1]
geo = json.load(open(os.path.join(root, 'geometry.json')))
meta = {m[0]: m for m in geo['meta']}

def find(st, names):
    out = []
    for n in names:
        hit = [f for f, m in meta.items() if m[2] == st and m[1] == n]
        assert len(hit) == 1, (st, n, hit)
        out.append(hit[0])
    return out

TX = ['El Paso', 'Hudspeth', 'Presidio', 'Brewster', 'Terrell', 'Val Verde', 'Kinney', 'Maverick', 'Webb', 'Zapata', 'Starr', 'Hidalgo', 'Cameron']
AL = ['Barbour', 'Bullock', 'Butler', 'Choctaw', 'Crenshaw', 'Dallas', 'Greene', 'Hale', 'Lowndes', 'Macon', 'Marengo', 'Montgomery', 'Perry', 'Pickens', 'Pike', 'Russell', 'Sumter', 'Wilcox']
ME = sorted(f for f, m in meta.items() if m[2] == 'ME')
regions = [
    {'id': 'rio-grande', 'name': 'Rio Grande border counties',
     'counties': find('TX', TX),
     'definition': 'The 13 Texas counties whose southern boundary is the Rio Grande, the U.S.-Mexico boundary from El Paso to the Gulf: El Paso, Hudspeth, Presidio, Brewster, Terrell, Val Verde, Kinney, Maverick, Webb, Zapata, Starr, Hidalgo and Cameron. Rule used by this page; the Census Bureau and USDA publish no list under this name. New Mexico, Arizona and California border counties are not included, since the line there is not the river.',
     'source': 'County names resolved to Census Bureau FIPS codes in geometry.json. For the wider 100-kilometer border area (44 U.S. counties), see the 1983 La Paz Agreement, as summarized by the HHS Office of Global Affairs (hhs.gov, U.S.-Mexico Border Region); not used here, no county list was available.'},
    {'id': 'black-belt', 'name': 'Alabama Black Belt',
     'counties': find('AL', AL),
     'definition': 'The 18 Alabama counties of the region\'s historical list: Barbour, Bullock, Butler, Choctaw, Crenshaw, Dallas, Greene, Hale, Lowndes, Macon, Marengo, Montgomery, Perry, Pickens, Pike, Russell, Sumter and Wilcox. The core is the ten counties J. D. Pope named in "Types of Farming Areas," Agriculture of Alabama (1930): Greene, Hale, Perry, Sumter, Marengo, Dallas, Wilcox, Lowndes, Montgomery and Bullock. No USDA or Census Bureau county list for the Black Belt was found, and sources differ on its edges (the federal Alabama Black Belt National Heritage Area, 2023, covers 19 counties); the other Black Belt states are not included.',
     'source': 'County list: Wikipedia, "Black Belt (region of Alabama)" (no source cited there); core: Pope (1930), as quoted in Wikipedia, "Black Belt in the American South". County names resolved to FIPS codes in geometry.json.'},
    {'id': 'maine', 'name': 'Maine',
     'counties': ME,
     'definition': 'All 16 counties of Maine.',
     'source': 'Census Bureau county list (FIPS state 23), as in geometry.json.'},
]
assert [len(r['counties']) for r in regions] == [13, 18, 16]
json.dump({'regions': regions}, open(os.path.join(root, 'regions.json'), 'w'), indent=1)
print({r['id']: len(r['counties']) for r in regions})
