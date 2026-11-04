#!/usr/bin/env python3
"""count_call.py: record a race call that a news outlet reported, then rebuild and publish the monitors site.

We do not call races. This records that an outlet did, linked to the outlet's own article, under
"Races called" on the Watching the count lane (and on the state's page).

  count_call.py URL --state Michigan [--race "U.S. Senate"] [--by "AP"] [--dry-run] [--no-push]

It fetches URL, takes the article's own headline (og:title, else <title>) as the listed title, and
refuses if the page cannot be read or does not contain "call"/"projected"/"declared"/"wins"/"won"/
"concede" anywhere (a guard against pasting the wrong link). Then it appends to calls.json, runs
build_stories.py, and commits static/monitors/stories.json + tools/monitors/calls.json by path and pushes.
"""
import argparse, html, json, os, re, subprocess, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
CALLS = os.path.join(HERE, "calls.json")
STATES = {"Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"}

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh) TransparencyCascade monitors"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url"); ap.add_argument("--state", required=True)
    ap.add_argument("--race", default=""); ap.add_argument("--party", choices=["D","R","I",""], default="", help="winner's party, as the article states it"); ap.add_argument("--by", default="", help="outlet that made the call, if not the publisher")
    ap.add_argument("--source", default="", help="publisher name as shown (default: og:site_name)")
    ap.add_argument("--title", default="", help="override the headline (use the article's own words)")
    ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--no-push", action="store_true")
    a = ap.parse_args()
    if a.state not in STATES: sys.exit(f"unknown state {a.state!r}; use the full name, e.g. 'North Carolina'")
    calls = json.load(open(CALLS))
    if any(c["url"] == a.url for c in calls): sys.exit("already recorded: " + a.url)
    try: page = fetch(a.url)
    except Exception as e: sys.exit(f"could not read the page ({e}); pass --title and --source to record it anyway is NOT supported: find a readable link")
    m = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)', page) or re.search(r"<title[^>]*>(.*?)</title>", page, re.S)
    title = a.title or (html.unescape(m.group(1)).strip() if m else "")
    if not title: sys.exit("no headline found; pass --title with the article's own headline")
    sm = re.search(r'<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']+)', page)
    source = a.source or (html.unescape(sm.group(1)).strip() if sm else re.sub(r"^www\.", "", a.url.split("/")[2]))
    text = re.sub(r"<[^>]+>", " ", page).lower()
    if not re.search(r"\b(call(s|ed)?|project(s|ed)?|declare(s|d)?|wins?|won|conced(e|es|ed))\b", text):
        sys.exit("the page never says called/projected/declared/wins/conceded; check the link")
    entry = {"url": a.url, "title": title, "source": source + (f" (call: {a.by})" if a.by else ""), "states": [a.state]}
    if a.race: entry["race"] = a.race
    if a.party: entry["party"] = a.party
    print(json.dumps(entry, indent=1))
    if a.dry_run: return
    site = os.path.join(REPO, "static", "monitors", "stories.json")
    before = json.load(open(site))["stories"]
    env = dict(os.environ)
    env.setdefault("POLLWATCH_DIR", os.environ.get("POLLWATCH_DIR") or "/private/tmp/claude-501/-Users-markr-kb/04fcc5df-f22b-438e-8a98-a2870b7e70fd/scratchpad/pollwatch")
    if not os.path.isdir(env["POLLWATCH_DIR"]): sys.exit("POLLWATCH_DIR not found: " + env["POLLWATCH_DIR"] + " (set it to the poll-watch findings folder)")
    import datetime as _dt; entry["recorded"] = _dt.datetime.now().strftime("%Y-%m-%dT%H:%M")
    calls.append(entry); json.dump(calls, open(CALLS, "w"), indent=1)
    subprocess.run([sys.executable, os.path.join(HERE, "build_stories.py")], check=True, stdout=subprocess.DEVNULL, env=env)
    after = json.load(open(site))["stories"]
    lost = {s["url"] for s in before} - {s["url"] for s in after}
    if lost:
        subprocess.run(["git", "-C", REPO, "checkout", "--", "static/monitors/stories.json"])
        calls.pop(); json.dump(calls, open(CALLS, "w"), indent=1)
        sys.exit(f"rebuild would drop {len(lost)} stories (wrong POLLWATCH_DIR?); nothing changed")
    paths = ["static/monitors/stories.json", "tools/monitors/calls.json"]
    subprocess.run(["git", "-C", REPO, "add", "--"] + paths, check=True)
    subprocess.run(["git", "-C", REPO, "commit", "-q", "-m", f"monitors: race call, {a.state}: {title[:60]}", "--"] + paths, check=True)
    if not a.no_push:
        subprocess.run(["git", "-C", REPO, "push", "-q"], check=True)
        print("pushed; live in about 5-15 minutes (deploy plus CDN cache)")

if __name__ == "__main__":
    main()
