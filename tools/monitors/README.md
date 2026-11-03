# DOJ election monitors microsite: build code

Source for `static/monitors/` (published at transparencycascade.org/monitors). The `static/monitors/` folder is the built site; this folder is how it was built. Hugo does not publish `tools/`.

## What each script does

- `analyze.py`: joins DOJ's Nov. 3, 2026 list (`inputs/doj-nov-3-2026-election-monitor-jurisdictions.csv`) to Census county population and race estimates, 2024 county presidential results and Section 203 language determinations. Writes `joined.json`. Run from this folder.
- `compare.py`: matches the list against DOJ's 2022 and 2024 lists (`inputs/24.txt`, `inputs/27.txt`, from DOJ's releases) to mark places new, returning or dropped.
- `build_states.py`: copies `static/monitors/index.html` into one page per state (title, description, share card, `MON_STATE`). Re-run after any change to `index.html`.
- `build_stories.py`: builds `static/monitors/stories.json`, the Election Day reports shown on place and state pages, from the poll watcher's verified findings (`POLLWATCH_DIR`, default `../pollwatch`) plus hand-added items. Only items whose article was fetched and quoted go in.
- Share cards are rendered from `static/monitors/_card.html` (`?state=<name>`) at 1200x630 in headless Chrome.

## Inputs not in git (too large)

- `cc.csv`: Census Bureau county characteristics, cc-est2024-alldata (July 2024 estimates, YEAR=6), from census.gov.
- `s203/`: Census Section 203 determinations (December 2021), sect203_All_Areas.csv.
- `inputs/pres24.csv` is the county-level 2024 compilation from github.com/tonmcg/US_County_Level_Election_Results_08-24.

## Deploy

Commit `static/monitors/` and push `main`; the GitHub Actions Hugo workflow publishes it.
