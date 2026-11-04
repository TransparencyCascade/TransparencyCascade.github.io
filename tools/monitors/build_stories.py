"""Build /monitors/stories.json: Election Day reporting linked to the places on DOJ's Nov. 3 monitor list.

Only items a poll-watch pass verified (article fetched, a sentence quoted) or a cascade-timeline entry we published.
Each story names the listed places it concerns, using data.json's own place names. Run, read the output, then deploy.
"""
import glob, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
PW = os.environ.get("POLLWATCH_DIR", os.path.join(HERE, "..", "pollwatch"))  # findings*.json from the poll watcher
SITE = os.path.expanduser("~/TransparencyCascade/static/monitors")
D = json.load(open(os.path.join(SITE, "data.json")))
LISTED = {(r["st"], r["j"]) for r in D["rows"]}

KIND = {"machines": "Voting equipment", "weather": "Flooding and weather", "monitors": "DOJ monitors",
        "legal": "Courts", "intimidation": "Voter intimidation", "other": "Misinformation", "lines": "Lines and delays",
        "call": "Race calls", "count": "Count and certification",
        "provisional": "Registration"}

# finding place strings that are not "Place, State" -> the listed places they concern
PLACES = {
    "Lansing/Dearborn/Flint, Michigan": [("Michigan", "Dearborn"), ("Michigan", "Flint")],
    "Broward/Palm Beach, Florida": [("Florida", "Broward"), ("Florida", "Palm Beach")],
    "Westchester (New York), New York": [("New York", "Westchester")],
    "Navajo Nation, Arizona": [("Arizona", "Navajo"), ("Arizona", "Apache")],
    "Oklahoma County, Oklahoma": [("Oklahoma", "Oklahoma")],
}
KC = [("Kansas", "Johnson"), ("Kansas", "Wyandotte"), ("Kansas", "Sedgwick"), ("Missouri", "Jackson"), ("Missouri", "Clay"), ("Missouri", "St. Louis")]
DROP = {  # verified but not an Election Day item for that place
    "https://www.kwch.com/2026/11/02/hundreds-stand-line-sedgwick-county-election-office-final-day-early-voting-midterm/",
    "https://newjerseyglobe.com/campaigns/bergen-county-election-error-wiped-mercer-voters-registration-and-voting-history/",
    "https://www.votebeat.org/national/2026/11/03/election-day-2026-live-blog-midterms-trump/",  # one line on Milwaukee, no detail
}
FIX_KIND = {"https://www.ktvq.com/news/longer-lines-possible-at-montana-polls-due-to-statewide-ballot-printing-issue": "machines",
            "https://dailyprogress.com/news/local/government-politics/elections/article_0d02273f-0742-4942-b094-4fd7be717f14.html": "monitors"}
FIX_SRC = {"https://www.koco.com/article/westchester-county-voting-machines-paper-ballots/74322211": "AP, via KOCO",
           "https://mirrorindy.org/indiana-elections-2026-mirror-indy-blog-marion-county-vote/": "Mirror Indy"}
COUNT_URLS = {  # these concern the count and certification, not the monitors
    "https://www.wsbtv.com/news/local/fulton-county/georgia-election-2026-fulton-asks-rescan-some-early-voting-ballots-after-scanner-issues/BD6TN7P27ZDIJBGG2OE3SY35BM/",
    "https://capturecascade.org/event/2026-11-03--fulton-county-asks-to-rescan-1069-early-voting-ballots-after-two-scanner-problems/",
}
COUNT_EXTRA = [  # count-lane items about a whole state (no single listed place)
    {"url": "https://capturecascade.org/event/2026-11-02--doj-asks-supreme-court-make-california-set-aside-20000-flagged-mail-ballots-sauer-application/",
     "title": "Supreme Court rejects DOJ's request to make California set aside 20,000 flagged mail ballots",
     "source": "Capture Cascade timeline", "kind": "Courts", "states": ["California"]},
    {"url": "https://capturecascade.org/event/2026-10-22--doj-sues-alaska-to-bar-senate-certification-if-sullivan-loses-nvra/",
     "title": "DOJ's suit to bar certifying Alaska's Senate result is dismissed; DOJ appeals, and on Election Day sends target letters in its Alaska Senate probe",
     "source": "Capture Cascade timeline", "kind": "Certification", "states": ["Alaska"]},
    {"url": "https://capturecascade.org/event/2026-10-30--thompson-tro-bars-doj-dhs-demands-and-prosecution-threats-election-officials-seiu-v-doj-3-26-cv-12800/",
     "title": "Judge barred DOJ and DHS demands and prosecution threats against election officials; on Election Day the Ninth Circuit put the order on hold",
     "source": "Capture Cascade timeline", "kind": "Courts", "states": ["California"]},
]
COUNT_EXTRA += [
    {"url": "https://www.13abc.com/2026/11/03/attorneys-plan-lawsuit-extend-voting-hours-beverly-elementary-polling-location-after-bomb-threat-blade-reports/",
     "title": "After a bomb threat closed a Toledo polling place for nearly two hours, a judge let its voters vote provisionally until 9:15 p.m.", "source": "13abc", "kind": "Count and certification", "states": ["Ohio"]},
    {"url": "https://www.wbtv.com/2026/11/03/north-carolina-election-officials-extend-voting-4-counties-what-we-know/",
     "title": "North Carolina extends voting at five precincts in four counties after stoppages; results delayed", "source": "WBTV", "kind": "Count and certification", "states": ["North Carolina"]},
    {"url": "https://www.wpxi.com/news/local/court-orders-precinct-remain-open-until-10-pm-voters-who-used-emergency-ballots-urged-return/DIWLVOBPFVE4NPYBY5Q5JSRXJA/",
     "title": "Court orders a Washington County, Pa., precinct open until 10 p.m.; 23 emergency-ballot voters urged to return and vote provisionally", "source": "WPXI", "kind": "Count and certification", "states": ["Pennsylvania"]},
]
EXTRA = [  # read by hand this session
    {"url": "https://www.news9.com/oklahoma-elections/oklahoma-county-election-board-polling-machine-issues",
     "title": "Oklahoma County Election Board addresses voting machine issues on Election Day", "source": "News 9",
     "kind": "machines", "places": [("Oklahoma", "Oklahoma")]},
    {"url": "https://capturecascade.org/event/2026-11-03--michigan-officials-contact-doj-after-monitors-question-poll-workers-in-dearborn-and-flint/",
     "title": "Michigan officials contact DOJ after reports its election monitors questioned poll workers in Dearborn and Flint",
     "source": "Capture Cascade timeline", "kind": "monitors", "places": [("Michigan", "Dearborn"), ("Michigan", "Flint")]},
    {"url": "https://www.newsfromthestates.com/node/435528",
     "title": "Arkansas' most populous county votes to bar DOJ monitors from entering polling sites",
     "source": "Arkansas Advocate", "kind": "monitors", "places": [("Arkansas", "Pulaski"), ("Arkansas", "Washington")]},
    {"url": "https://www.timesleader.com/news/1764336/kingston-ward-6-voting-at-hoyt-library-may-be-extended-to-9-p-m-after-false-fire-alarm",
     "title": "Kingston Ward 6 voting at Hoyt Library may be extended to 9 p.m. after false fire alarm",
     "source": "Times Leader", "kind": "legal", "places": [("Pennsylvania", "Luzerne")]},
    {"url": "https://blockclubchicago.org/2026/11/03/illinois-midterm-election-2026-pritzker-seeks-3rd-term-voters-to-choose-fully-elected-school-board/",
     "title": "Illinois Midterm Election 2026: Far North Side Precinct Runs Out Of Ballots, Leading To Long Waits",
     "source": "Block Club Chicago", "kind": "lines", "places": [("Illinois", "Chicago")]},    {"url": "https://www.wishtv.com/news/marion-county-calls-for-more-poll-workers-to-count-votes/",
     "title": "Marion County calls for more poll workers to count votes", "source": "WISH-TV", "kind": "count", "places": [("Indiana", "Marion")]},
    {"url": "https://capturecascade.org/event/2026-08-26--wyoming-gov-gordon-and-laramie-county-clerk-say-doj-primary-monitors-were-aggressive/",
     "title": "At Wyoming's August primary, DOJ monitors asked for training guides and to examine tabulators; the governor said they exceeded their authority",
     "source": "Capture Cascade timeline (NBC News)", "kind": "monitors", "places": [("Wyoming", "Laramie County")]},
    {"url": "https://capturecascade.org/event/2026-10-27--wyoming-ag-kautz-opinion-says-state-law-bars-doj-election-monitors-from-polling-places/",
     "title": "Wyoming's attorney general: state law bars DOJ election monitors from polling places",
     "source": "Capture Cascade timeline (Cowboy State Daily)", "kind": "monitors", "places": [("Wyoming", "Laramie County")]},
    {"url": "https://capturecascade.org/event/2026-11-03--ice-posts-election-day-warning-if-you-vote-illegally-we-will-find-you/",
     "title": "ICE on Election Day: “If you vote illegally, we will find you”",
     "source": "Capture Cascade timeline (AP)", "kind": "intimidation", "places": []},
    {"url": "https://www.cpr.org/2026/11/03/colorado-midterm-election-2026-live-blog-results/",
     "title": "Colorado midterm election 2026 live blog", "source": "Colorado Public Radio", "kind": "monitors", "places": [("Colorado", "Adams")]},
    {"url": "https://www.wptv.com/news/palm-beach-county/flooding-closes-mangonia-park-polling-location-impacts-nearby-goodwill",
     "title": "Flooding closes Mangonia Park polling location, impacts nearby Goodwill", "source": "WPTV", "kind": "weather", "places": [("Florida", "Palm Beach")]},
    {"url": "https://www.wctv.tv/2026/11/03/some-local-polling-places-lose-power-during-heavy-rain-according-leon-county-supervisor-elections/",
     "title": "Some local polling places lose power during heavy rain, according to Leon County Supervisor of Elections", "source": "WCTV", "kind": "weather", "places": [("Florida", "Leon")]},
    {"url": "https://www.kcrg.com/2026/11/03/10-federal-election-monitors-come-linn-county-election-day/",
     "title": "10 federal election monitors come to Linn County on Election Day", "source": "KCRG", "kind": "monitors", "places": [("Iowa", "Linn")]},
    {"url": "https://www.newhavenindependent.org/2026/11/03/doj-monitor-hits-westville-annex/",
     "title": "DOJ monitors crisscross New Haven, reported at polling places in at least seven wards", "source": "New Haven Independent", "kind": "monitors", "places": [("Connecticut", "New Haven")]},
    {"url": "https://www.cpr.org/2026/11/03/federal-election-monitors-adams-county/",
     "title": "Federal election monitors arrive in Colorado amid election scrutiny", "source": "Colorado Public Radio", "kind": "monitors", "places": [("Colorado", "Adams")]},
    {"url": "https://utahnewsdispatch.com/2026/11/03/federal-election-monitors-are-in-salt-lake-county-utah/",
     "title": "It's Election Day: Here's why 12 election monitors are in Utah", "source": "Utah News Dispatch", "kind": "monitors", "places": [("Utah", "Salt Lake")]},
    {"url": "https://www.stlpr.org/government-politics-issues/2026-11-03/no-problems-reported-as-doj-observes-missouri-and-illinois-voters",
     "title": "No problems reported as DOJ observes Missouri and Illinois voters", "source": "St. Louis Public Radio", "kind": "monitors", "places": [("Missouri", "St. Louis"), ("Illinois", "St. Clair"), ("Illinois", "Madison")]},
    {"url": "https://westvirginiawatch.com/2026/11/03/u-s-department-of-justice-monitors-election-in-kanawha-county/",
     "title": "U.S. Department of Justice monitors election in Kanawha County", "source": "West Virginia Watch", "kind": "monitors", "places": [("West Virginia", "Kanawha")]},
    {"url": "https://www.wsfa.com/2026/11/04/doj-sends-federal-election-monitors-mobile-2-other-alabama-counties/",
     "title": "DOJ sends federal election monitors to Mobile, 2 other Alabama counties", "source": "WALA, via WSFA", "kind": "monitors", "places": [("Alabama", "Mobile"), ("Alabama", "Jefferson"), ("Alabama", "Montgomery")]},
    {"url": "https://alaskabeacon.com/2026/11/03/us-department-of-justice-sends-election-monitors-to-urban-and-rural-alaska/",
     "title": "US Department of Justice sends election monitors to urban and rural Alaska", "source": "Alaska Beacon", "kind": "monitors", "places": [("Alaska", "Anchorage"), ("Alaska", "Dillingham"), ("Alaska", "Kusilvak")]},
    {"url": "https://www.live5news.com/2026/11/03/doj-deploys-election-monitors-charleston-county-voters-express-mixed-reactions/",
     "title": "DOJ deploys election monitors to Charleston County as voters express mixed reactions", "source": "Live 5 News", "kind": "monitors", "places": [("South Carolina", "Charleston")]},
    {"url": "https://www.azfamily.com/2026/11/04/long-lines-reported-some-maricopa-county-vote-centers-heres-what-know/",
     "title": "Long lines reported at some Maricopa County vote centers: Here’s what to know", "source": "AZFamily", "kind": "lines", "places": [("Arizona", "Maricopa")]},
]


def split_headline(h, publisher):
    h = (h or "").strip()
    if publisher and h.endswith(" - " + publisher):
        return h[: -len(" - " + publisher)].strip(), publisher
    m = re.match(r"^(.*)\s+-\s+([^-]{2,60})$", h)
    if m:
        return m.group(1).strip(), (publisher or m.group(2)).strip()
    return h, publisher or ""


stories, seen = [], set()
for f in sorted(glob.glob(os.path.join(PW, "findings*.json"))):
    for x in json.load(open(f)):
        u = x.get("url")
        if not x.get("verified") or not u or u in seen or u in DROP:
            continue
        place = x.get("place") or ""
        if place.startswith("Kansas City metro"):
            places = KC
        elif place in PLACES:
            places = PLACES[place]
        else:
            j, _, st = place.rpartition(", ")
            places = [(st, j)]
        places = [p for p in places if p in LISTED]
        if not places:
            print("UNMAPPED", place, u)
            continue
        title, src = split_headline(x.get("headline"), x.get("publisher"))
        src = FIX_SRC.get(u, src)
        kind = FIX_KIND.get(u, (x.get("kind") or "other").lower())
        seen.add(u)
        stories.append({"url": u, "title": title, "source": src, "kind": KIND.get(kind, kind), "places": places})
for e in EXTRA:
    if e["url"] not in seen:
        seen.add(e["url"])
        stories.append(dict(e, kind=KIND.get(e["kind"], e["kind"])))

for s_ in stories:
    s_["lane"] = "count" if (s_["url"] in COUNT_URLS or s_["kind"] in ("Race calls", "Count and certification")) else "watchers"
CALLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "calls.json")  # written by count_call.py
if os.path.exists(CALLS):
    COUNT_EXTRA = COUNT_EXTRA + [dict(c, kind="Race calls") for c in json.load(open(CALLS))]
for e in COUNT_EXTRA:
    stories.append(dict(e, lane="count", places=[]))
out = {"updated": "2026-11-03", "note": "Reporting from Election Day, linked to the places on DOJ's list. Each link was opened and read before it was listed.",
       "stories": [dict(s, places=[{"st": a, "j": b} for a, b in s["places"]], states=s.get("states") or sorted({a for a, b in s["places"]})) for s in stories]}
json.dump(out, open(os.path.join(SITE, "stories.json"), "w"), indent=1)
print(len(stories), "stories")
for s in stories:
    print(" ", s["kind"], "|", ", ".join(b + " " + a[:2] for a, b in s["places"]), "|", s["title"][:80], "|", s["source"])
