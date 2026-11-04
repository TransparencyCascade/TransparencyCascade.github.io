# County swing, 2026 U.S. Senate vs. 2024 president

`county-swing-2026-senate-vs-2024-president.csv` has one row per county (or county-equivalent) in the 30 states that held a Democrat-vs-Republican U.S. Senate race on Nov. 3, 2026.

**Unofficial.** These are election-night and day-after counts, pulled once at 19:17 UTC on Nov. 4, 2026, not certified results. Counts will change as states finish counting and certify.

## What the swing measures

`swing_toward_dem_pts` = the 2024 presidential margin (Trump minus Harris, in points) minus the 2026 Senate margin (Republican minus Democrat, in points). A positive number means the county voted more Democratic in the 2026 Senate race than it did for president in 2024.

It compares two different races, a Senate race with its own candidates against a presidential race, so candidate effects are part of every number.

## Columns

| column | meaning |
|---|---|
| state, county_fips, county | location (FIPS from the 2024 file) |
| race | the 2026 Senate race and candidates counted |
| votes_dem, votes_rep, total | 2026 Senate votes |
| margin26_rep_minus_dem_pts | 2026 margin, Republican minus Democrat, as a share of all votes cast in the race |
| margin24_trump_minus_harris_pts | 2024 presidential margin |
| swing_toward_dem_pts | the swing, as defined above |
| total24 | 2024 presidential total votes |
| percent_reporting | the feed's reporting figure; the feed does not define it |
| counted | `yes` if the row is in the published count; `no` if dropped (see `note`) |
| note | corrections and drops, with the reason |
| source_url, pull_time_utc | where and when the 2026 figures were read |

## Sources

- **2026:** AP county results as published by CNN (`politics.api.cnn.io/results/county-races/2026-SG-{state}.json`; Florida and Ohio use `SP`). Massachusetts and Rhode Island town results are summed into counties. One Illinois county (Schuyler) uses the county clerk's own total, because the feed row held Election Day votes only (see `note`).
- **2024:** the county presidential results compiled by tonmcg (github.com/tonmcg/US_County_Level_Election_Results_08-24), from Fox News results. Its compiler describes it as not authoritative. We did not check it against certified totals.

## Left out

- Idaho, Montana, Nebraska and South Dakota: the Republican's main opponent was not a Democrat.
- Alaska: it reports by state House district, not county, and is still counting.
- Rows marked `counted = no`: Vermilion County, Ill. (Danville not yet reporting) and Hancock County, Ill. (the feed row appears to be missing early and mail ballots).

## Summary at this pull

2,156 of 2,177 counted counties moved toward the Democrat. The 21 that moved the other way were 13 in Maine, 4 in Illinois, 3 in Minnesota and 1 in Florida. None of them moved more than 6.4 points.

Published by The RAMM / Transparency Cascade, Nov. 4, 2026. Corrections welcome: open an issue on this repository.
