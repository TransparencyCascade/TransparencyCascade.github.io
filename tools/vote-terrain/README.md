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
| `views2d/` | Circles, Arrows, Dots, Scatter, and for the House track Districts (`strips.js`) and Seats and votes (`seats.js`) (d3 + SVG), and what they share |
| `views.js` | Saved views and tours (`views.json`): `?view=`, `?tour=`, the card with the caption, caption tokens resolved from the data |

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
5. `python3 -I tools/vote-terrain/build_effective.py <downloads> static/maps/vote-terrain/elections.json static/maps/vote-terrain/balance.json static/maps/vote-terrain/effective.json`
6. `VT_MODULES=<dir with node_modules/d3-force, d3-polygon> node tools/vote-terrain/build_circles.mjs` — `circles-*.json`.
7. `python3 -I tools/vote-terrain/build_house.py <house district csv> <house state csv> static/maps/vote-terrain/balance.json static/maps/vote-terrain/house.json`
   The House track from `cascade-research/notes/data/house-2026-vs-2024-vs-2022-by-{district,state}-unofficial-*.csv`:
   results by district, each district's swing for every pair of elections on the same lines, each state's
   largest and median observed swing, the plausible-swing default, seats and the efficiency gap. Checks: 2022
   and 2024 seats equal the House history office's divisions in `balance.json`; district votes sum to the
   state file in every state and year; margins agree with the CSV. Rules in its docstring.

`geometry_codec.mjs` packs the geometry (lossless; it checks the round trip). To convert a geometry.json in
the old shape: `node tools/vote-terrain/geometry_codec.mjs <old geometry.json> static/maps/vote-terrain`.

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
5. List every figure that changed (old and new value) for Mark before any piece cites a refreshed number.
6. Take the "unofficial" flag off an election only when its certified source is in place.
7. Run the smoke test. Expected differences are the changed numbers; re-record once they are checked.
8. Commit data, builders and notes by explicit paths. Deploying is Mark's call.
