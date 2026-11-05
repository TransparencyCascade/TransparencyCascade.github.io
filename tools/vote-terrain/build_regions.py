#!/usr/bin/env python3 -I
"""Preset regions for the close-up drawer: static/maps/vote-terrain/regions.json.

    python3 -I tools/vote-terrain/build_regions.py static/maps/vote-terrain

Each region lists its county codes (five-digit FIPS, resolved from county names in geometry.json) and the definition
the page prints. Checks: every named county is found exactly once, and the count matches the definition.

No USDA or Census Bureau definition of "Rio Grande border counties" was found (searched 2026-11-05), so that region states
the rule used. For the border, the 1983 La Paz Agreement defines a border area of 100 km either side of the line (44 U.S.
counties per the HHS Border Health Commission); no county-by-county list came with it, so it is not used.

The Black Belt is a data rule, not a list: counties of the 11 former Confederate states where Black residents are at least
25% of the population. Wimberley (2010, Journal of Rural Social Sciences 25(1): 103-118, a research note on the Southern
Black Belt, pp. 108-109) defines it that way for 1980 (as quoted by Wikipedia, "Black Belt in the American South"; the
journal's PDF was not readable from here, so the 25% and the state set are checked second-hand), and notes that studies
use other cutoffs (25, 33 or 40%). Kentucky, Maryland, Delaware and Oklahoma are not counted: that literature takes the
11 states. Population figures are the 2020 Census Redistricting Data (P.L. 94-171) Summary File, table P1 (Race): total
population P1_001N and Black or African American alone P1_004N, per county, kept in black-belt-p1-2020.csv beside this
script (fips, total, black alone; every county of the 11 states). Black alone excludes people of two or more races."""

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
BB_STATES = {'AL', 'AR', 'FL', 'GA', 'LA', 'MS', 'NC', 'SC', 'TN', 'TX', 'VA'}
BB_THRESHOLD = 0.25
bb = {}
for ln in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'black-belt-p1-2020.csv')).read().split('\n')[1:]:
    if ln:
        k, tot, blk = ln.split(',')
        bb[k] = (int(tot), int(blk))
BB = sorted(k for k, (t, b) in bb.items() if b >= BB_THRESHOLD * t and k in meta)
assert all(meta[k][2] in BB_STATES for k in BB) and not [k for k in bb if k not in meta and bb[k][1] >= BB_THRESHOLD * bb[k][0]]
assert {meta[k][2] for k in BB} == BB_STATES
ME = sorted(f for f, m in meta.items() if m[2] == 'ME')
regions = [
    {'id': 'rio-grande', 'name': 'Rio Grande border counties',
     'counties': find('TX', TX),
     'definition': 'The 13 Texas counties whose southern boundary is the Rio Grande, the U.S.-Mexico boundary from El Paso to the Gulf: El Paso, Hudspeth, Presidio, Brewster, Terrell, Val Verde, Kinney, Maverick, Webb, Zapata, Starr, Hidalgo and Cameron. Rule used by this page; the Census Bureau and USDA publish no list under this name. New Mexico, Arizona and California border counties are not included, since the line there is not the river.',
     'source': 'County names resolved to Census Bureau FIPS codes in geometry.json. For the wider 100-kilometer border area (44 U.S. counties), see the 1983 La Paz Agreement, as summarized by the HHS Office of Global Affairs (hhs.gov, U.S.-Mexico Border Region); not used here, no county list was available.'},
    {'id': 'black-belt', 'name': 'Black Belt',
     'counties': BB,
     'definition': 'The %d counties of the 11 former Confederate states (Alabama, Arkansas, Florida, Georgia, Louisiana, Mississippi, North Carolina, South Carolina, Tennessee, Texas and Virginia) where Black residents were at least 25%% of the population in the 2020 census. Rule from Wimberley (2010), Journal of Rural Social Sciences 25(1), who applies it to 1980; researchers use other cutoffs (25, 33, 40%%), and this page uses the lowest, so the region is wide. Kentucky, Maryland, Delaware and Oklahoma are not counted. Black means Black or African American alone; people of two or more races are not counted as Black.' % len(BB),
     'source': 'Census Bureau, 2020 Census Redistricting Data (P.L. 94-171) Summary File, table P1 (Race): P1_004N, Black or African American alone, over P1_001N, total population, by county. Threshold: Dale W. Wimberley, "Quality of Life Trends in the Southern Black Belt, 1980-2005: A Research Note," Journal of Rural Social Sciences 25(1), 2010, pp. 108-109 (cited second-hand via Wikipedia, "Black Belt in the American South"; the PDF could not be read). Virginia counties and independent cities are separate counties here, as in geometry.json.'},
    {'id': 'maine', 'name': 'Maine',
     'counties': ME,
     'definition': 'All 16 counties of Maine.',
     'source': 'Census Bureau county list (FIPS state 23), as in geometry.json.'},
]
assert [len(r['counties']) for r in regions] == [13, len(BB), 16]
json.dump({'regions': regions}, open(os.path.join(root, 'regions.json'), 'w'), indent=1)
print({r['id']: len(r['counties']) for r in regions})
