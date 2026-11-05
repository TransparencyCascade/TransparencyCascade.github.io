# Vote terrain: builders, checks, snapshots

The page lives in `static/maps/vote-terrain/` (Hugo publishes it). This folder holds what builds and
checks it; Hugo does not publish `tools/`.

## The page's code

`static/maps/vote-terrain/js/`, ES modules with no build step (d3 7.9.0 is a global from the CDN; three.js
0.160.0 comes through the import map in `index.html`):

| Module | What it does |
|---|---|
| `main.js` | Entry: loads the data, wires the panel, timeline, tabs, keys and selection, renders |
| `state.js` | The reader's state, the lenses, the URL hash |
| `data.js` | Where data files come from (the page folder, or `snapshots/<slug>/` with `?snapshot=`) |
| `geometry.js` | Decodes `geometry.json` + `geometry.bin` (the page and the builders share it) |
| `model.js` | Margins, swing, power weights, effective vote, heights, the per-county rows |
| `colour.js` | The equal-lightness ramps |
| `house.js` | The House track: its timeline entries, and the bands (captured, contestable, at risk) recomputed from the plausible swing (`ps=` in the link) |
| `tooltip.js`, `balance.js`, `selection.js`, `find.js`, `table.js`, `about.js` | The tip, balance of power, selection codec, find box, table, read-once drawers |
| `terrain.js` | Smooth terrain (three.js), loaded only with WebGL |
| `blocks.js` | Exact counties (three.js), loaded the first time it is shown |
| `views2d/` | Circles, Arrows, Dots, Scatter, for the House track Districts (`strips.js`) and Seats and votes (`seats.js`), History (`history.js`, any track), Road to 270 (`road.js`) and Closest races (`closest.js`, any track; `rb=`, `ro=` in the link), Scatter's second chart (`sx=ms`), the Simulator (`sim.js`, any track) and Power (`power.js`, county tracks: weight per vote ranked, the cartogram, concentration) (d3 + SVG), and what they share (`style.js`: ink, rules, the state tile grid) |
| `views2d/dropoff.js`, `views2d/split.js` | Turnout drop-off (county votes in the top midterm race as a share of the presidential year before, against margin, with 2022's band behind 2026; `c=drop` colours Terrain and Circles by it) and Ticket splitting (Senate margin minus governor margin on a flat map and as a strip per state) |
| `power.js` | The Power tab's arithmetic (pure): weight per vote by state with its three parts, each state's share of votes, electoral votes and Senate seats, each party's concentration curve and the counties that reach a share of its votes (also the selection rule `k:`) |
| `sim.js` | The swing simulator's arithmetic (pure): each place's flip point under uniform or proportional swing, seats and control at a swing, where control changes |
| `races.js` | Road to 270 (and 51) and Closest races (pure): the bar's segments, line and tipping point, every race on an election day with margin, votes to flip (half the margin plus one, as `balance.json`) and whether it changed hands; reads `simulator.json`, `house.json` and the county results |
| `flips.js`, `swingview.js` | Flips and bellwethers (rules `f:<from>:<to>` and `w`, narrowed to a selection with `/<selection>`); margin against swing and its running median (rules `g:` box, `n:` quadrant) |
| `turnout.js`, `places.js`, `drawers.js` | Turnout drop-off and ticket splitting (pure: the race used per state, shares, the 2022 band, Senate against governor margins); a place's history across every election (one county, its state, an area); the pinned County history card (`hk=`, opened by "History" in a tooltip, a double-click or the H key) and the side drawer (regional close-up `cu=`, the state's two races in Ticket splitting) |
| `views.js` | Saved views and tours (`views.json`): `?view=`, `?tour=`, the card with the caption, caption tokens resolved from the data |
| `overlays.js` | Overlays from our research (`overlays.json`, `ov=` in the link): each layer's counties, and their swing against matched unmarked counties (same state, lean band and size band; also the selection rule `o:`). Marks are drawn by `terrain.js` (`marks()`), `views2d/circles.js`, `dots.js` and `arrows.js` |

`window.__vt` exists only for the smoke test, `export.mjs` and console checks. When you change a module, bump the
`?v=` on `js/main.js` in `index.html`; the other modules are not versioned, so a browser may need a hard
reload during development.

## Builders

Run from the repository root, in this order (each step reads what the one before wrote):

1. `python3 -I tools/vote-terrain/build_senate_governor.py <workdir> tools/vote-terrain/extra-elections.json`
   Senate and governor county results (MEDSL precinct files, the AP-via-CNN 2026 feed; rules in its docstring).
2. `VT_MODULES=<dir with node_modules/d3-geo, topojson-client> VT_PRES=<countypres_2000-2024.csv> node tools/vote-terrain/build_data.mjs`
   `geometry.json` + `geometry.bin` and `elections.json`. Set `VT_PRES` explicitly: the default path is a
   temporary folder from the session that built it.
3. `node tools/vote-terrain/build_terrain.mjs` — `terrain.json`, `terrain-counties.bin`, `terrain-cells.bin`, `terrain-<election>-s<N>.bin`.
4. `python3 -I tools/vote-terrain/build_balance.py <downloads> <countypres csv> <house district csv> static/maps/vote-terrain/balance.json`
   The smallest change uses certified state totals from the FEC (2016 and 2020 Federal Elections Table 2, the
   2024 official results file), not the county file's state sums; the build prints every state where the two differ.
   `noCounty.AK`: Alaska's statewide totals (president 2016-2024 and Senate 2020-2022 from the FEC; Senate 2026 from
   the AP feed, unofficial). Alaska reports by House district, not by county, so the county views leave it out and
   `build_effective.py` adds it to the state figures and national totals as one unit; governor races have no Alaska total.
5. `python3 -I tools/vote-terrain/build_effective.py <downloads> static/maps/vote-terrain/elections.json static/maps/vote-terrain/balance.json static/maps/vote-terrain/effective.json`
6. `VT_MODULES=<dir with node_modules/d3-force, d3-polygon> node tools/vote-terrain/build_circles.mjs` — `circles-*.json`.
7. `python3 -I tools/vote-terrain/build_house.py <house district csv> <house state csv> static/maps/vote-terrain/balance.json static/maps/vote-terrain/house.json`
   The House track from `cascade-research/notes/data/house-2026-vs-2024-vs-2022-by-{district,state}-unofficial-*.csv`:
   results by district, each district's swing for every pair of elections on the same lines, each state's
   largest and median observed swing, the plausible-swing default, seats and the efficiency gap. Checks: 2022
   and 2024 seats equal the House history office's divisions in `balance.json`; district votes sum to the
   state file in every state and year; margins agree with the CSV. Rules in its docstring.

8. `python3 -I tools/vote-terrain/build_history.py ~/tcp-kb-internal/cascade-research/notes/data/vt-history static/maps/vote-terrain/balance.json static/maps/vote-terrain/history.json`
   The History tab (one chart at a time, `hc=seats|small|weight`): residents per House seat at each census since
   1910 (Census Bureau apportionment file), the smallest change in each presidential election since 1976 (MIT state
   totals), and the weight of a vote in each presidential year since 1976 (residents per senator and electoral votes
   per vote cast, largest against smallest, using the census in force: the last taken at least two years before the
   election), from the files gathered for `vt-historical-depth-house-and-presidential` (method note
   `vt-historical-depth-method-note.md`). Reads `elections.json` beside the output to link years the page has.
   Checks: state seats add to the national row at every census; electoral votes add to 538 every year; 2016, 2020
   and 2024 equal `balance.json`'s smallest change.

9. `python3 -I tools/vote-terrain/build_simulator.py <downloads> static/maps/vote-terrain/balance.json static/maps/vote-terrain/simulator.json`
   The Simulator's races (`sw=` swing, `swr=u|p` rule, `lock=` states held, `sm=` map body): for each election day,
   each state's certified presidential totals and electoral votes (Maine's and Nebraska's district electors held),
   each Senate race's top Democratic-side and Republican candidates (fusion lines merged; races not a Democrat
   against a Republican held at their result), the seats not on the ballot, and who breaks a 50-50 tie. Reads the
   same downloads as `build_balance.py` and imports its parsers. Checks: at no swing the electoral votes are each
   year's pledged result and the Senate is the chamber after each election; seats not up plus races make 100.
   The House comes from `house.json` at run time. Gap: the MIT 2024 Senate state file has no row for Nebraska's
   special election, so that seat is counted with the seats not up and does not move.

11. `python3 -I tools/vote-terrain/build_regions.py static/maps/vote-terrain`
   `regions.json`: the close-up's preset regions (`sel=p:<id>&cu=<id>`), each with its county codes (resolved from names in
   `geometry.json`, checked) and a cited definition. No USDA or Census Bureau list was found for "Rio Grande border counties" or
   "the Black Belt", so each states the rule used; the Black Belt is a data rule (Black alone at least 25% in the 2020 census P1 table, 11 former Confederate states; counties in `black-belt-p1-2020.csv`; see its definition).

`geometry_codec.mjs` packs the geometry (lossless; it checks the round trip). To convert a geometry.json in
the old shape: `node tools/vote-terrain/geometry_codec.mjs <old geometry.json> static/maps/vote-terrain`.

10. `python3 -I tools/vote-terrain/build_overlays.py ~/detention-pipeline static/maps/vote-terrain/overlays.json`
   Overlays from our research (`ov=monitors|detention`). DOJ monitors: the counties holding a jurisdiction on DOJ's
   Nov. 3, 2026 list, from the monitors page's join (`static/monitors/data.json`; a listed city counts as its county).
   ICE detention: the counties holding a facility averaging 10 or more people a day in fiscal 2026, from the
   detention-pipeline site's facility entries (Vera Institute ICE Detention Trends, FY2026). Each layer lists the
   places it cannot draw (Alaska, Puerto Rico, Guam and others). Refresh when either source changes.

## Smoke test

    node tools/vote-terrain/smoke.mjs            # compare with the baseline; exit 1 on any difference
    node tools/vote-terrain/smoke.mjs --record   # write the baseline (after a change you meant)

Every tab, lens, office and shape (the House track's two views, the plausible swing and their tables included), saved
views and tours (every caption must resolve), one card export, elections with and without a baseline, selections by state,
rule and click, the table, find, keys, play, reset, phone width, and WebGL off. For each it records the key,
panels, balance box, notes, pressed buttons, a hash of every flat-view SVG and a screenshot (failing above
0.2% of pixels changed). It needs playwright-core (`VT_PLAYWRIGHT`) and a Chromium (`VT_CHROME`; it uses
Playwright's Chrome for Testing with the Mac's GPU when installed, else SwiftShader, about 20 times slower).
The baseline and CDN cache live in `tools/vote-terrain/.smoke/` (not committed): record one before you start
changing code. `--only <name>` runs a subset (and with `--record` updates just those); `--loose <prefix>`
reports screenshot differences for those scenarios without failing. Which metro labels show is reported,
not failed: labels that would collide are hidden by a check that runs every 30 frames.

## Saved views, tours and exports

`static/maps/vote-terrain/views.json` names views: a slug, a title, a typed file line, a caption, a sources
line, the state (the address-hash keys; keys left out take the defaults) and optionally a snapshot. Tours are
ordered lists of view slugs. Captions and sources hold **no typed numbers**: every figure is a token such as
`{bal.elections.pres2024.smallest.president.votes|n}` or `{calc.house.2026.captured}`, resolved by the page
from the data files (roots, filters and the derived `calc` figures are listed at the top of `js/views.js`). A
token that does not resolve shows `[?]` and logs an error, which fails the smoke test.

    …/maps/vote-terrain/?view=<slug>                  the view, still, with its caption card
    …/maps/vote-terrain/?tour=<slug>                  Back, Next, Skip through the tour's views
    …/maps/vote-terrain/?snapshot=<s>&view=<slug>     on frozen data (a view with "snapshot" goes there itself)

A reader's own hash wins on reload, so changing the view and reloading keeps the change. Exports run offline
in headless Chromium and write to `tools/vote-terrain/.export/` (not committed; `--out` may not point into
`static/`):

    node tools/vote-terrain/export.mjs --view <slug>                       card: master 2400 × 1500, link, square
    node tools/vote-terrain/export.mjs --tour <slug> --gif --mp4           a card per step, then the animation
    node tools/vote-terrain/export.mjs --sweep districts-2026 --from 2 --to 14 --step 1 --gif
                                                                         a House view across plausible swings

Cards follow the RAMM design system (article-images skill): onionskin ground, carbon-blue ink, a typed file
line, the view, the caption, a foot with the sources and the tag. The link and square shapes are padded by
that skill's `export_sizes.py`, never cropped. `--hold` sets seconds per step; `--scale` (default 2) sets how
large the map's own labels and axes come out on the card, since the page lays out in box / scale CSS pixels.
A view with a selection is framed on it. Flat views drop their controls and foot in export and show whole rows
only; when not every state fits, the head says which are shown ("the 12 states with the most seats ...").
Needs python3 with Pillow, and ffmpeg for animations (without it, the frames and a note are written).

## Money data (`money.json`, data only: no page view reads it yet)

`python3 -I tools/vote-terrain/build_money.py` (cache `tools/vote-terrain/.fec-cache/`, about 240 MB, not committed; raw zips
are deleted after extraction; pass `--cache` to move it). Phase 7, "Money: dollars per decisive vote". Rules are in the script's docstring.

- **Files.** FEC bulk files for 2008-2024: `weball<YY>` (candidate totals; `webl<YY>` is fetched but not used), `cn<YY>` (candidate
  election year, so money raised toward another year's election is left out), `pas2<YY>` (types 24C party coordinated expenditures; 24A/24E
  stand in for independent expenditures in 2008), `independent_expenditure_<YYYY>.csv` (2010 on; the FEC publishes none for 2008).
  Votes: `simulator.json` (Senate 2016-2024, president), the MIT Senate state file (doi:10.7910/DVN/PEJ5QU) and the MIT president file
  in `vt-history`; where two cover one race, every difference is listed in `checks.voteSources` (the simulator wins).
- **Figures.** Every figure is `{type, what, usd, src}`: `raised` (candidate receipts), `spent` (candidate disbursements), `outside` (independent
  expenditures for and against, party coordinated). `sources` gives each file, URL, retrieval date and the FEC's Last-Modified.
- **Decisive votes, two definitions.** `flip`: half the margin plus one. `moved`: the change in the Democratic-minus-Republican margin since the previous
  race for the same seat (Senate six years earlier, regular elections; president four years earlier). `dollarsPerDecisiveVote` divides candidate
  spending, and candidate spending plus outside money, by each.
- **Independent expenditures.** The latest version per (committee, transaction) is kept, terminated rows dropped. Mapped to a race through the candidate
  named; an id that is on the cycle file but under $5,000 raised and spent is left out (the file holds bogus filings of up to $10 billion that would
  otherwise swamp a race), and an id on no cycle file falls back to the row's own state (Senate) or a surname match (president). Everything left out
  or not used is counted in `unmapped`.
- **Checks against the FEC's own totals** (`checks.fecPublished`): 2016, per office, Presidential and Senate within 0.6% on receipts and
  disbursements (https://www.fec.gov/updates/statistical-summary-24-month-campaign-activity-2015-2016-election-cycle/); House plus Senate 3.3% / 4.2% above.
  2020: House plus Senate within 0.6% (https://www.fec.gov/updates/statistical-summary-24-month-campaign-activity-2019-2020-election-cycle/),
  presidential 2.1% / 1.9% below. Sources of difference: the FEC tables count candidates running in the cycle and stop at 31 December; `weball` is as of the file's date.
- **Left out.** Presidential dollars are national (the files carry none by state), so only votes are by state. Two Senate seats in one state
  and cycle: votes, no dollars (the files do not name the seat). House races: about 4 MB at this shape against the 300 KB limit, and the page
  has House votes only from 2022. Unreported money (issue ads, 501(c) spending that names no candidate, state-level party money) is described in
  `unreported`, never estimated.

## Snapshots

A published piece links to the page at a saved view. When the live data is refreshed, the piece should keep
showing the numbers it was written from:

    node tools/vote-terrain/snapshot.mjs <slug> --note "piece title"   # before publishing the piece
    node tools/vote-terrain/snapshot.mjs --verify <slug>                # hashes still match the manifest?
    node tools/vote-terrain/snapshot.mjs --list

The snapshot copies every data file the page reads into `static/maps/vote-terrain/snapshots/<slug>/` with
`manifest.json` (time, commit, size and SHA-256 of each file, the sources and unofficial flags each file
names). The piece links to `…/maps/vote-terrain/?snapshot=<slug>#<view>`; the page says "Frozen data:
snapshot <slug>, <date>" under its title. A snapshot is never overwritten. Each is about 15 MB; git stores a
file identical to one already committed only once, but the published site copies every snapshot.

## Refresh checklist (certified 2026 results, a corrected source)

The open task is `cascade-research/notes/vote-terrain-refresh-2026-with-certified-results.md` (park until 2026-12-15).

1. Record a smoke baseline on the current code (`smoke.mjs --record`) if `.smoke/baseline` is stale.
2. Snapshot the data behind every piece already published from the page (`snapshot.mjs <slug>`), and commit
   the snapshots before changing anything.
3. Fetch the new source files; keep each one dated beside its note in `cascade-research/notes/data/`.
4. Rerun the builders above from step 1 (or the first step whose inputs changed). Rerun each script's own
   checks: county sums against certified state totals, the effective-vote decomposition, population totals.
   For the House: rebuild the district CSVs with `build_house_2026_comparison.py` on the certified canvasses,
   then `build_house.py`; the plausible-swing default moves with the data (and later with 1976–2024 history).
   Then `build_simulator.py` (2026 Senate from the certified canvass in place of the AP feed).
5. List every figure that changed (old and new value) for Mark before any piece cites a refreshed number.
6. Take the "unofficial" flag off an election only when its certified source is in place.
7. Run the smoke test. Expected differences are the changed numbers; re-record once they are checked.
8. Commit data, builders and notes by explicit paths. Deploying is Mark's call.
