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
| `views2d/` | Circles, Arrows, Dots (tab label "Swing strips"; URL key `w=dots` unchanged), Scatter, for the House track Districts (`strips.js`) and Seats and votes (`seats.js`), History (`history.js`, any track), Road to 270 (`road.js`) and Closest races (`closest.js`, any track; `rb=`, `ro=` in the link), Scatter's second chart (`sx=ms`), the Simulator (`sim.js`, any track) and Power (`power.js`, county tracks: weight per vote ranked, the cartogram, concentration) (d3 + SVG), and what they share (`style.js`: ink, rules, the state tile grid) |
| `people.js`, `views2d/people.js` | The People tab (dot map, `w=people`, `pn=500|1000|5000`): one dot per N votes coloured by party, inside each county where people live (`people.json` + `people.bin`, lazy-loaded the first time the tab is shown; `build_people.mjs`). `people.js` is pure: decode the slots, `dotCounts` (a county's votes over N, rounded up or down at random with a fixed seed so small counties are not always zero), `totals` (the caption tokens `calc.people.<election>`). Drawn on canvas (outlines, dots as pixels in a shuffled order, hover and selection outline); hover is the county tooltip, a click selects, a selection fades other counties; the table is the county table with a Dots column |
| `views2d/dropoff.js`, `views2d/split.js` | Turnout drop-off (county votes in the top midterm race as a share of the presidential year before, against margin, with 2022's band behind 2026; `c=drop` colours Terrain and Circles by it) and Ticket splitting (Senate margin minus governor margin on a flat map and as a strip per state) |
| `power.js` | The Power tab's arithmetic (pure): weight per vote by state with its three parts, each state's share of votes, electoral votes and Senate seats, each party's concentration curve and the counties that reach a share of its votes (also the selection rule `k:`) |
| `sim.js` | The swing simulator's arithmetic (pure): each place's flip point under uniform or proportional swing, seats and control at a swing, where control changes |
| `races.js` | Road to 270 (and 51) and Closest races (pure): the bar's segments, line and tipping point, every race on an election day with margin, votes to flip (half the margin plus one, as `balance.json`) and whether it changed hands; reads `simulator.json`, `house.json` and the county results |
| `flips.js`, `swingview.js` | Flips and bellwethers (rules `f:<from>:<to>` and `w`, narrowed to a selection with `/<selection>`); margin against swing and its running median (rules `g:` box, `n:` quadrant) |
| `turnout.js`, `places.js`, `drawers.js` | Turnout drop-off and ticket splitting (pure: the race used per state, shares, the 2022 band, Senate against governor margins); a place's history across every election (one county, its state, an area); the pinned County history card (`hk=`, opened by "History" in a tooltip, a double-click or the H key) and the side drawer (regional close-up `cu=`, the state's two races in Ticket splitting) |
| `funnel.js`, `views2d/funnel.js` | The Funnel tab (`w=funnel`; `fy=` year 2016-2024, empty follows the election in view; `fs=` the stage rate that colours Circles and Terrain, `c=fun`; `fc=` a second place, `s:IN` or `n` for the nation): from residents to ballots counted for the nation or the selection, each stage a bar as wide as its share of residents, with the effective weight of a vote beside it, the removals, mail and provisional rejections, and the reasons for removal as reported. Hover a stage for its count, rate and EAVS item; click it to choose its rate (removal, mail rejection, provisional rejection, registration gap, inactive share, citizens per resident, counted per citizen) and press Circles or Terrain to colour by it, in points above or below the national rate. `funnel.json` (1.4 MB) loads the first time the tab or its colour is shown. Pure arithmetic in `funnel.js` (aggregate for the nation, states or counties; rates; the colour value), also used by the table and the caption tokens `calc.funnel.y<year>.<nation|ST>.*` |
| `money.js`, `views2d/money.js` | The Money tab (`mc=time|lost|donors`, `md=flip|moved`, `mm=cand|party|out`, `my=` cycle; pure arithmetic in `money.js`, also used by the table, the caption tokens `calc.money.*` and the balance box's cost line): dollars per decisive vote per Senate race 2008-2026 with the outside money no race can be named for beside it; outspent and lost; where the money came from (donor concentration, donors of $1 million or more with their filings, America PAC) |
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

12. `VT_MODULES=<dir with node_modules/d3-geo> node tools/vote-terrain/build_people.mjs`
   `people.json` + `people.bin`: the dot map's slots. Reads `.census-cache/CenPop2020_Mean_TR.txt` (2020 tract population and population-weighted centre,
   https://www2.census.gov/geo/docs/reference/cenpop2020/tract/CenPop2020_Mean_TR.txt) and `.census-cache/2020_Gaz_tracts_national.zip` (tract land
   area, the Gazetteer; both about 6 MB, not committed) and projects with build_data.mjs's `geoAlbersUsa`. Method in one line: each county's slots are
   drawn from its tracts, a tract chosen in proportion to its population, the slot placed at random within a disc as large as the tract's land
   around its centre of population, kept inside the county outline. Slots are in random order and seeded (SEED, then the county code), so a rebuild gives the same
   bytes. A county holds ceil(most votes any election counts there / 500) + 1 slots, so every election at every N has enough; positions are for where people live,
   not how they voted, so one file serves every election (the party of each dot comes from the election's county totals at run time). 325,694 slots, 1.27 MB (1.13 MB gzipped).
   Checks printed: tract population against the page's counties (9,719 people left out: two Alaska census areas created after the county outlines were drawn,
   and Puerto Rico), slots that fell back to a tract centre (246: the disc did not land inside the county outline in 12 tries).

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

## Money data (`money.json`, read by the Money tab, the table, the caption tokens and the balance box)

`python3 -I tools/vote-terrain/build_money.py` (cache `tools/vote-terrain/.fec-cache/`, about 1.0 GB, not committed; raw zips are deleted after
extraction and the `indiv` files, 0.1 to 5.9 GB each, are streamed through `curl | bsdtar` and never stored whole; pass `--cache` to move it).
Phase 7, "Money: dollars per decisive vote". Rules are in the script's docstring. The first run reads about 21 GB and takes about 18 minutes (a rerun on the cache, about 35 seconds).

- **Files.** FEC bulk files for 2008-2026: `weball<YY>` (candidate totals; `webl<YY>` is fetched but not used), `cn<YY>` (candidate
  election year, so money raised toward another year's election is left out), `pas2<YY>` (types 24C party coordinated expenditures; 24A/24E
  stand in for independent expenditures in 2008), `independent_expenditure_<YYYY>.csv` (2010 on; the FEC publishes none for 2008),
  `webk<YY>` (PAC and party summaries), `indiv<YY>` (itemized individual contributions, filtered to super PAC recipients).
  Votes: `simulator.json` (Senate 2016-2024 certified, 2026 the unofficial AP feed, flagged `simulator-unofficial`), the MIT Senate state file
  (doi:10.7910/DVN/PEJ5QU) and the MIT president file in `vt-history`; where two cover one race, every difference is listed in
  `checks.voteSources` (the simulator wins).
- **Figures.** Every figure is `{type, what, usd, src}`: `raised` (candidate receipts), `spent` (candidate disbursements), `outside` (independent
  expenditures for and against, party coordinated). `sources` gives each file, URL, retrieval date and the FEC's Last-Modified.
- **Decisive votes, two definitions.** `flip`: half the margin plus one. `moved`: the change in the Democratic-minus-Republican margin since the previous
  race for the same seat (Senate six years earlier, regular elections; president four years earlier). `dollarsPerDecisiveVote` divides candidate
  spending, and candidate spending plus outside money, by each. The page counts three ways (`mm=`): candidates; plus party coordinated expenditures;
  plus the independent expenditures that name the race's candidates.
- **Sides.** Each Senate race with votes carries `sides.D` and `sides.R`: the two candidates named in the vote record, matched to FEC candidates by
  surname (so an independent counted on the Democratic side is found), else by party code. Each side has its own spending, the independent expenditures
  for and against it and its party coordinated expenditures. Outside money naming no candidate id is in the race totals only. These feed "Outspent and lost".
- **Independent expenditures.** The latest version per (committee, transaction) is kept, terminated rows dropped. Mapped to a race through the candidate
  named; an id that is on the cycle file but under $5,000 raised and spent is left out (the file holds bogus filings of up to $10 billion that would
  otherwise swamp a race), and an id on no cycle file falls back to the row's own state (Senate) or a surname match (president). Everything left out
  or not used is counted in `unmapped`.
- **Outside money as committee totals** (`committees`, per cycle 2008-2026, from `webk<YY>`): super PACs (type O), hybrid PACs (types V and W, without
  ActBlue and WinRed, which are type V but pass earmarked gifts through and are listed apart as `conduit`), party committees (types Y and Z; type X and the
  single-candidate type U are left out and U is counted under `excluded`). Per group: receipts, disbursements, transfers, individual contributions,
  Schedule E two ways (`scheduleESummaryUsd`: the committee summary's own independent-expenditure line, the same filings as the disbursements;
  `scheduleEFileUsd`: the Schedule E file summed by committee, which carries 24- and 48-hour reports the summaries have not caught up with),
  and the split the page shows: `allocatedToARaceUsd` (Schedule E, plus coordinated expenditures for parties) and `notAllocatedToARaceUsd` (disbursements
  less that: operating costs such as canvassing, petitions and staff, transfers to other committees, and money for races the page does not draw). Receipts
  and disbursements include transfers between committees, so a dollar passed along is counted by both. The page never shows one part without the other.
- **Net of transfers** (per group, per cycle): `netReceiptsUsd` = receipts less transfers in from affiliated and other party committees (F3X line 12; webk `TRANS_FROM_AFF`);
  `netDisbursementsUsd` = disbursements less transfers out to affiliated and other party committees (line 22; `TRANF_TO_AFF`) and contributions to federal candidates and other
  committees (line 23; `CONTRIB_TO_OTHER_CMTE`); `netNotAllocatedToARaceUsd` = net disbursements less Schedule E (and coordinated). The Money tab shows net by default (`mg=net`), gross with `mg=gross`.
  Contributions received from other political committees (line 11c) are not removed: the giver is usually outside these groups.
- **Same point in each cycle** (`committees.cycles.<2022|2024|2026>.preGeneral`; `mp=pre`, the default, or `mp=full`): the FEC's summary files hold one row per committee and cycle as of the
  file's date, so the per-filing data is the electronically filed Form 3X (calendar year to date, column B) from the FEC's daily zips
  (`bulk-downloads/electronic/<YYYYMMDD>.zip`), each .fec read by an HTTP range request (first few KB; nothing is downloaded whole; cached by day in `.fec-cache/f3x/`, about 5 MB; the first run
  takes about 40 minutes for three cycles). Cycle to date = the last report of the year before (through 31 December) + the last report of the election year covering through the pre-general
  date (2022-10-19, 2024-10-16, 2026-10-14: 20 days before the election), latest filing number winning, among reports filed by election day. Committees are grouped by their webk type.
  `reconcile` compares total disbursements with the summary file for committees whose summary ends by election day (2026: 2,985 committees, 96% to the dollar, -0.25% in total).
  Committees that file monthly report through 30 September at that point; the comparison is of what the filings on record said, the same rule in each cycle.
  Caption tokens: `calc.money.same.y2022|y2024|y2026` and `vs2024`, `vs2022` (see views.js).
- **Donor concentration** (`donors`, per cycle 2010-2026): itemized individual contributions (Schedule A line 11A, from `indiv<YY>`) to the cycle's
  super PACs, deduplicated to the latest version per (committee, transaction), terminated rows dropped, refunds subtracted. Donors are keyed by name and
  state (the FEC has no donor id: two people of one name in one state are one donor here). Entity type IND only; companies and LLCs are totalled apart
  (`itemizedOrganizationUsd`). Memo lines (MEMO_CD X: an attribution of money received through another entity, such as an in-kind gift booked to a company)
  are not added to a donor's cash and are totalled apart, labelled "memo-attributed". Shares: top 10 and top 100 donors' cash over the super PACs' total
  receipts (`TTL_RECEIPTS`, which includes transfers between committees) and over their individual contributions. Only donors of $1 million or more are
  named, each with the amount, first and last gift, the committees and the four largest lines with their filing number, date and image number.
- **America PAC** (`americaPac`): the committee summary and Schedule E for C00879510, and the Musk cash, in-kind and memo lines recomputed from the research
  note's receipts CSV (`cascade-research/notes/data/america-pac-c00879510-receipts-2025-2026-musk-and-in-kind-lines.csv`; note
  `vt-same-ballot-senate-vs-governor-gaps-2026-method-and-results`), whose July to October lines come from filings 2026216 and 2038959.
- **2026 is partial.** `coverage` gives, per cycle, the date each file's filings run through (committee summaries, candidate summaries, itemized lines,
  Schedule E file); the page shows them. Votes are the unofficial AP feed.
- **Checks against the FEC's own totals** (`checks.fecPublished`): 2016, per office, Presidential and Senate within 0.6% on receipts and
  disbursements (https://www.fec.gov/updates/statistical-summary-24-month-campaign-activity-2015-2016-election-cycle/); House plus Senate 3.3% / 4.2% above.
  2020: House plus Senate within 0.6% (https://www.fec.gov/updates/statistical-summary-24-month-campaign-activity-2019-2020-election-cycle/),
  presidential 2.1% / 1.9% below. Sources of difference: the FEC tables count candidates running in the cycle and stop at 31 December; `weball` is as of the file's date.
- **Left out.** Presidential dollars are national (the files carry none by state), so only votes are by state. Two Senate seats in one state
  and cycle: votes, no dollars (the files do not name the seat). House races: about 4 MB at this shape against the 300 KB limit, and the page
  has House votes only from 2022. Unreported money (issue ads, 501(c) spending that names no candidate, state-level party money, contributions to
  organizations that do not disclose) is described in `unreported`, never estimated. 2008 has no super PACs (they date from 2010) and no Schedule E file.
- **API key.** None is needed or stored. The FEC API's `DEMO_KEY` allows 40 calls an hour and was already used up when this was built, so the itemized
  contributions come from the bulk files; a personal key (https://api.data.gov/signup/, 1,000 calls an hour) would only be needed to refresh a single
  committee between bulk releases.

## Voter funnel data (`funnel.json`, read by the Funnel tab, the table, the caption tokens and the Circles/Terrain colour `c=fun`)

`python3 -I tools/vote-terrain/build_funnel.py tools/vote-terrain/.eavs-cache/csv static/maps/vote-terrain` (about 20 seconds). Phase 7, "From residents to power: the voter funnel". Rules are in the script's docstring.

- **Files.** The U.S. Election Assistance Commission's Election Administration and Voting Survey (EAVS) public CSVs from https://www.eac.gov/research-and-data/datasets-codebooks-and-surveys: 2016 V1.1,
  2018 V1.3 (Updates3), 2020 V1.2, 2022 V1, 2024 V2 (Feb 2026), the "nolabel" CSV of each, unzipped into `tools/vote-terrain/.eavs-cache/csv/` (about 220 MB with the zips and codebooks in `.eavs-cache/raw/`; not committed).
  Residents and citizens of voting age come from `effective.json` (2010 Census and ACS 2014-2018 for 2016-2020; 2020 Census and ACS 2019-2023 for 2022-2024), so the funnel and the effective vote use one population.
- **Items, with the code each wave uses.** Registered A1a (all records, active and inactive); active A1b (A3a in 2016); removed A11a / A9a / A12a (2016 / 2018-2022 / 2024) and reasons b-g (moved, death, felony, failed to respond and did not vote, mental incompetence, voter request), 2024
  adds A12h duplicate records (included in A12a); mail ballots returned C1b and rejected C4b (2016), C4a (2018, 2020), C9a (2022, 2024); provisional ballots E1a and rejected E1d; people counted F1a. Ballots cast is derived (F1a plus the rejected mail and
  provisional ballots), a floor, because EAVS has no total-cast item. `meta.items` lists every code per year.
- **Active is the main bar; inactive is a band.** EAVS's total registered (A1a) includes inactive records, so in 2024 it nearly equals citizens of voting age (232.4M against 238.7M) and the registration gap looked like 2.7%. The Funnel's registered bar is now active registrations (A1b: 209.0M nationally, 63.1% of residents,
  12.4% of citizens of voting age short). Inactive registrations (registered less active, 23.3M, 10.0% of registrations) are a hatched band beside it with a labelled row, and one line says why they exist: inactive records stay on the rolls until removed under the National Voter
  Registration Act's notice-and-wait process, 52 U.S.C. 20507(d) (verified from the text: a notice, no reply, and no voting through the day after the second general election for Federal office after the notice). The registration-gap colour (`fs=gap`) is citizens of voting age without an active registration.
  Inactive is computed only over jurisdictions that reported both items (`pr` slots 8 and 9: active and registered, pairwise valid), so a jurisdiction missing A1b does not turn its whole registration into "inactive"; the table lists active, inactive and all records separately.
  Tokens: `calc.funnel.y2024.nation.act|inact|inactPct|reg|gapPct`.
- **Missing is not zero.** EAVS marks a figure that is not there with -88 (not applicable), -99 (data not available), -77 or a blank (-888888 and -999999 as text before 2018). The build treats every one as missing: a state's sum is of the jurisdictions that
  reported, `miss` counts those that did not, `missReg` is the registered voters they hold, and a figure no jurisdiction in a state reported is null. A county's figure is null when any jurisdiction in it is missing. Counts per year and item are in `checks.missingCodes`;
  per state in `checks.missingJurisdictionsByState`.
- **Towns to counties.** New England reports by town. A town's 10-digit FIPS code starts with its county's five digits, and towns are summed by those five digits (Connecticut's codes are the eight historic counties the page uses). Illinois's five city election
  commissions are added to their counties (Chicago to Cook). Wisconsin (municipalities with no county code), Alaska (one unit), Kansas City MO (spans four counties) and Maine's unorganized townships are in the state rows only (`checks.notInACounty`).
- **Checks.** (1) People counted (F1a) per state against the page's turnout (presidential votes in 2016, 2020 and 2024; the largest Senate or governor total the page has in 2018 and 2022, a floor): within -1% to +5%; `checks.turnout.mismatches` lists the 14 of
  239 state-years outside it. (2) Registered and removed totals against the harmonised research file (`cascade-research/notes/data/eavs-removals-registration-jurisdiction-harmonized-2008-2024-2026-11-05.csv`): 496 state-years, none differ.
  (3) The smoke test recomputes Indiana, Georgia and the nation from the raw 2024 CSV and compares them with what the page shows.
- **Guards.** A removed registration or a rejected ballot is not proof that an eligible voter was turned away; the page shows reasons as reported (they do not always add to the total) and never says a count changed an outcome.

## Readiness checklist (Phase 8, launch)

Read from each source's own page on 2026-11-05. Done means checked and fixed or confirmed; open means someone has to decide or wait.

**Done**
- [x] **Licences and attribution.** The About drawer has a "Data and licences" section naming every dataset, its terms and the credit asked (table below).
- [x] **Page weight.** First load of the default view (desktop, empty cache): 5,126,900 bytes in 69 files before, 4,638,816 bytes in 68 files after (about 2.28 MB gzipped before, 1.82 MB after, estimated by gzipping each file; Hugo's host decides the real
  compression). The baseline election's terrain grid (`terrain-pres2020-s1.bin`, 488 KB) is now read only when a view uses it (swing colour or the ghost grid); the default view did not. Largest files at start: three.js 1.27 MB (CDN, 258 KB gzipped), `elections.json` 784 KB,
  `terrain-pres2024-s1.bin` 488 KB, `terrain-cells.bin` 326 KB, d3 280 KB (CDN). Already lazy: People, Money, Funnel, Simulator data, exact counties (`blocks.js`).
- [x] **Build scripts outside the published folder.** `static/maps/vote-terrain/` holds only what the page loads: 106 files, 19,623,049 bytes (18.7 MiB; about 12.1 MB gzipped): `index.html`, `js/` (571,782 bytes), 27 `.json` data files (4,347,920 bytes with `views.json`) and 30 `.bin` files (14,646,245 bytes). No scripts, CSVs, caches, source maps, logs or
  dotfiles. Snapshots would add about 15 MB each under `snapshots/<slug>/`; none exist yet.
- [x] **Table version of every chart.** Every tab opens a table (T or the Table button) with the chart's figures: counties, districts, states, the simulator's races, the funnel's stages. Each chart (`svg` or `canvas`) is now an `img` with a label that names it and points to the table.
- [x] **Accessibility basics.** Every button, select, input and summary has a name (checked on all 17 tabs). Focus outlines now cover select, input, summary and links as well as buttons. Tab reaches all 13 enabled tabs and Enter or Space activates them. With reduced motion the first-visit spin and the tours do not animate, and transitions are instant.
- [x] **Context-loss recovery.** If the browser drops the 3D context the page falls back to Circles and says why (a handler on the terrain and exact-county canvases; tested by forcing the loss).
- [x] **Phone pass** (390 x 844 and 768 x 1024, every tab; screenshots viewed). Fixed: the tab bar wrapped into three rows over the key and balance box (now one row that scrolls and keeps the active tab in view); the controls panel covered half the screen in flat views (now folds to its title with a "Controls" button, and unfolds on demand); long chart pickers ran off the screen; touch targets under 24 px
  (info buttons, About, summaries, selects) are larger on coarse pointers and phones. No page-level horizontal overflow on any tab at either size.

**Open**
- [ ] **Mark's launch decisions** (plan, "Decisions for Mark"): default view on phones (Circles recommended; the terrain is still the default and the phone pass found it works but is heavy), simulator rule (uniform, or also proportional), overlay layers for launch, House on the timeline, launch scope, history depth, and where it lives (address and timing). The plan lists seven; "six" in the request is a miscount or one has been settled.
- [ ] **Certified 2026 results.** Every 2026 figure is the unofficial AP-via-CNN feed. Follow "Refresh checklist" below once the states certify (task parked until 2026-12-15), then take the "unofficial" flags off.
- [ ] **AP via CNN licence.** No terms found for `politics.api.cnn.io`; the About drawer says "unofficial results, as reported". Mark decides whether to keep using the feed publicly, ask AP for a licence, or hold 2026 results for the certified canvass.
- [ ] **Vera Institute licence.** Vera's data access licence (License.md in github.com/vera-institute/ice-detention-trends) grants "the limited right to use the Dataset for Recipient's own academic, nonprofit, and research purposes", forbids commercial use and forbids using or distributing the Dataset "in any form" beyond that. The ICE detention overlay
  (`overlays.json`) publishes per-facility average daily populations from it. Mark decides: ask Vera for written permission to publish, drop the per-facility figures, or drop the layer. Until then the drawer names the licence and links it.
- [ ] **FEC contributor names.** 52 U.S.C. 30111(a)(4) bars selling or using information copied from FEC reports to solicit contributions or for commercial purposes. The Money tab names donors of $1 million or more with employer and state. A free page for reporting is the ordinary use, but Mark should confirm the page stays clear of soliciting and of anything commercial (a paid tier, ads, a donate ask on the page).
- [ ] **House data licence.** The House History, Art & Archives site and the Clerk state no licence for the party-division and election-statistics tables (the rights page covers images only). They are counts, cited to the page. Optional: write history@mail.house.gov to confirm reuse.
- [ ] **Licence for our own compiled files.** The data files combine CC0, public-domain and cited sources; Mark chooses what, if anything, to say about reuse of the compiled files.
- [ ] **Long-run House data download.** The House by district since 1976 (MIT Election Lab, "U.S. House 1976-2024") and the presidential-by-district series are not downloaded yet (the History tab has seats per census, the smallest change and weight per vote only). Needs the long download and a build step.
- [ ] **Phone: not fixed.** The page is still a desktop layout squeezed down: the key and balance box sit under the tab bar and take about 190 px of a 844 px screen, so flat views get a short scrolling area; the plan's bottom sheet (peek, half, full) is not built. Some chart titles clip at 390 px
  (History, Power), SVG axis labels on History crowd, and a few controls stay under 24 px at 768 (the sim's "Lock", "Reset to actual"; the "+" on the balance box is 22 x 19). Tablet (768 px) keeps the desktop layout, which works.
- [ ] **Accessibility: not fixed.** Chart marks (circles, dots, strips) are reachable by mouse and touch only; the table is the keyboard and screen-reader route. The play button steps the timeline every 2.5 s under reduced motion rather than stopping (it only runs when pressed). No automated colour-contrast audit has been run.
- [ ] **Smoke baseline.** Re-record once after this branch's changes are accepted, then run one compare.

**Licences, as the About drawer states them**

| Source | Used for | Terms (checked 2026-11-05) | Credit |
|---|---|---|---|
| MIT Election Data and Science Lab | county and state returns, president, Senate, governor, precinct files | CC0 1.0 in each Harvard Dataverse record (VOQCHQ, 42MVDX, PEJ5QU, NVQYMG, NT66Z3, UYQIEP, IAD3XR, ZCM3BN, NYTPDU, OAARCY); the 2022 and 2024 GitHub copies carry no licence file, the same series is CC0 | not required; cite the dataset |
| Census Bureau | population, apportionment, CVAP (ACS), tract centres, outlines (us-atlas, ISC) | U.S. Government work, 17 U.S.C. 105 (no copyright); no licence page of its own | cite the Census Bureau as source of the original data (census.gov/about/policies/citation.html) |
| FEC | money, certified results | 17 U.S.C. 105; 52 U.S.C. 30111(a)(4) restricts solicitation and commercial use of contributor information | cite the FEC |
| EAC EAVS | registration, removals, rejected ballots | 17 U.S.C. 105; eac.gov states no further terms | cite the EAC |
| AP via CNN (2026) | unofficial 2026 results | no terms found; shown as "unofficial results, as reported" | **needs Mark** |
| Vera Institute | ICE detention overlay | Vera Data Access License Terms: academic, nonprofit and research use, no commercial use, no distribution in any form | Vera Institute of Justice; **needs Mark** |
| DOJ press releases | monitoring list | public domain unless otherwise indicated (justice.gov/legalpolicies) | citation appreciated |
| House History, Art & Archives; Clerk; National Archives; Senate | party divisions, statistics, electoral votes | no licence stated for the tables (counts, cited) | cite the page |
| d3 7.9.0, three.js 0.160.0, us-atlas 3.0.1, Archivo Narrow, Courier Prime | code and type | ISC, MIT, ISC, SIL OFL (Google Fonts metadata) | licence files travel with the CDN copies |

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
9. Money: after the post-general reports are filed (due in early December) and the FEC has processed them, rerun `build_money.py` (delete the 2026 files in
   `.fec-cache/` first: `*26*`, `indiv-2026-superpac.psv*`, `independent_expenditure_2026.csv*`, `pas2-2026-*`, `webk26*`). Check `coverage` for 2026 (committee
   summaries, candidate summaries, itemized lines and the Schedule E file should run past 2026-11-25), then take the "partial" and "unofficial" labels off
   2026 in `js/views2d/money.js` and `build_money.py` only when the votes are certified. Compare America PAC's totals with the research note's.
