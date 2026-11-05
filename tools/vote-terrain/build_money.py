#!/usr/bin/env python3 -I
"""Money: dollars per decisive vote (plan Phase 7). Data only; no page view reads this yet.

    python3 -I tools/vote-terrain/build_money.py [--cache DIR] [--out static/maps/vote-terrain/money.json]

Downloads FEC bulk files for the 2008-2024 cycles into a cache folder outside static/ (default
tools/vote-terrain/.fec-cache, not committed), keeps only what is needed (raw zips are deleted after extraction;
the committee-to-candidate file is filtered to three transaction types while streaming), and builds money.json.

Per race (Senate by state and cycle; president by cycle, with the votes by state):
  raised   candidate total receipts (FEC candidate summary file weball<YY>), with transfers in and candidate-supplied money
  spent    candidate total disbursements (same file), with transfers out
  outside  independent expenditures supporting and opposing the race's candidates (independent_expenditure_<YYYY>.csv,
           2010 on; for 2008 the file does not exist, so Schedule E rows in pas208 types 24A/24E), mapped to a race
           through the candidate supported or opposed (candidate id; where blank, the row's own office/state/district)
  party    party coordinated expenditures (pas2<YY> transaction type 24C), mapped through the candidate
Every figure is {type, what, usd, src}; src names an entry in "sources" (file, URL, retrieved, FEC Last-Modified).

Decisive votes, two definitions side by side:
  flip   the race's votes to flip: half the margin plus one (floor(margin / 2) + 1, as balance.json and races.js)
  moved  the change in the Democratic-minus-Republican margin since the previous race for the same seat
         (Senate: the same state six years earlier, regular elections only; president: four years earlier), where both exist
Votes: simulator.json (2016-2024 Senate, president), the MIT Senate state file 1976-2024 (doi:10.7910/DVN/PEJ5QU) for
earlier Senate years, and the MIT president-by-state file in vt-history. Where two sources cover the same race they are
compared and every difference is listed in "checks".

Unreported money is described, never estimated: see "unreported" in the output. Races where the FEC files cannot name the
seat (two Senate seats in a state in one cycle) carry votes but no dollars.
"""
import csv, collections, datetime, hashlib, io, json, math, os, re, sys, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '../..'))
args = sys.argv[1:]
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
CACHE = os.path.abspath(opt('--cache', os.path.join(HERE, '.fec-cache')))
OUT = os.path.abspath(opt('--out', os.path.join(REPO, 'static/maps/vote-terrain/money.json')))
PAGE = os.path.dirname(OUT)
HIST = os.path.expanduser('~/tcp-kb-internal/cascade-research/notes/data/vt-history')
CYCLES = list(range(2008, 2026, 2))
THRESH = 5000      # a person is a federal candidate (FEC) on receiving or spending more than $5,000; IE rows naming anyone below it are excluded and listed
UA = {'User-Agent': 'Mozilla/5.0 (vote-terrain build_money.py)'}
os.makedirs(CACHE, exist_ok=True)
SOURCES = {}


def fetch(url, name):
    """Download url to CACHE/name unless there; record the source with its date. Returns the path."""
    path = os.path.join(CACHE, name)
    meta = path + '.meta.json'
    if not os.path.exists(path) or not os.path.exists(meta):
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=300) as r, open(path, 'wb') as f:
            lm = r.headers.get('Last-Modified')
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                f.write(b)
        json.dump({'url': url, 'retrieved': datetime.date.today().isoformat(), 'lastModified': lm}, open(meta, 'w'))
    m = json.load(open(meta))
    return path, m


def register(sid, file, m, note=None):
    SOURCES[sid] = {'file': file, 'url': m['url'], 'retrieved': m['retrieved'], 'fecLastModified': m.get('lastModified')}
    if note:
        SOURCES[sid]['note'] = note


def unzip_member(zpath, member_re, dest):
    """Extract the first member matching member_re to dest, then delete the zip."""
    with zipfile.ZipFile(zpath) as z:
        names = [n for n in z.namelist() if re.search(member_re, n)]
        with z.open(names[0]) as src, open(dest, 'wb') as out:
            while True:
                b = src.read(1 << 20)
                if not b:
                    break
                out.write(b)
    os.remove(zpath)


def yy(c):
    return str(c)[2:]


# ---------------------------------------------------------------- FEC files
def get_candidates(c):
    """weball<YY> (all candidates with activity in the cycle) + cn<YY> (election year, office). webl is fetched for a cross-check."""
    base = f'https://www.fec.gov/files/bulk-downloads/{c}/'
    out = {}
    for kind in ('weball', 'webl', 'cn'):
        txt = os.path.join(CACHE, f'{kind}{yy(c)}.txt')
        if not os.path.exists(txt) or not os.path.exists(txt + '.meta.json'):
            z, m = fetch(base + f'{kind}{yy(c)}.zip', f'{kind}{yy(c)}.zip')
            unzip_member(z, r'\.txt$', txt)
            os.replace(z + '.meta.json', txt + '.meta.json')
        m = json.load(open(txt + '.meta.json'))
        register(f'{kind}{yy(c)}', f'{kind}{yy(c)}.zip', m)
    return out


W_COLS = ['CAND_ID', 'CAND_NAME', 'CAND_ICI', 'PTY_CD', 'CAND_PTY_AFFILIATION', 'TTL_RECEIPTS', 'TRANS_FROM_AUTH', 'TTL_DISB', 'TRANS_TO_AUTH',
          'COH_BOP', 'COH_COP', 'CAND_CONTRIB', 'CAND_LOANS', 'OTHER_LOANS', 'CAND_LOAN_REPAY', 'OTHER_LOAN_REPAY', 'DEBTS_OWED_BY',
          'TTL_INDIV_CONTRIB', 'CAND_OFFICE_ST', 'CAND_OFFICE_DISTRICT', 'SPEC_ELECTION', 'PRIM_ELECTION', 'RUN_ELECTION', 'GEN_ELECTION',
          'GEN_ELECTION_PRECENT', 'OTHER_POL_CMTE_CONTRIB', 'POL_PTY_CONTRIB', 'CVG_END_DT', 'INDIV_REFUNDS', 'CMTE_REFUNDS']
CN_COLS = ['CAND_ID', 'CAND_NAME', 'CAND_PTY_AFFILIATION', 'CAND_ELECTION_YR', 'CAND_OFFICE_ST', 'CAND_OFFICE', 'CAND_OFFICE_DISTRICT', 'CAND_ICI',
           'CAND_STATUS', 'CAND_PCC', 'CAND_ST1', 'CAND_ST2', 'CAND_CITY', 'CAND_ST', 'CAND_ZIP']


def num(s):
    try:
        return float(s) if s not in ('', None) else 0.0
    except ValueError:
        return 0.0


def read_pipe(path, cols):
    with open(path, newline='', encoding='latin-1') as f:
        for row in csv.reader(f, delimiter='|'):
            if len(row) >= len(cols) - 2:
                yield dict(zip(cols, row))


def load_cycle_candidates(c):
    """{cand_id: row} for candidates running in cycle c (cn election year = c); weball amounts."""
    get_candidates(c)
    cn = {r['CAND_ID']: r for r in read_pipe(os.path.join(CACHE, f'cn{yy(c)}.txt'), CN_COLS)}
    out, skipped = {}, collections.Counter()
    for r in read_pipe(os.path.join(CACHE, f'weball{yy(c)}.txt'), W_COLS):
        cid = r['CAND_ID']
        k = cn.get(cid)
        if cid[:1] not in 'SPH':
            continue
        if not k or k['CAND_ELECTION_YR'] != str(c):
            skipped[cid[:1]] += 1       # on the cycle's file for money raised toward another year's election
            continue
        out[cid] = {'id': cid, 'name': r['CAND_NAME'], 'party': r['CAND_PTY_AFFILIATION'], 'office': cid[0], 'st': r['CAND_OFFICE_ST'] or k['CAND_OFFICE_ST'],
                    'dist': r['CAND_OFFICE_DISTRICT'] or k['CAND_OFFICE_DISTRICT'],
                    'receipts': num(r['TTL_RECEIPTS']), 'transIn': num(r['TRANS_FROM_AUTH']), 'disb': num(r['TTL_DISB']), 'transOut': num(r['TRANS_TO_AUTH']),
                    'self': num(r['CAND_CONTRIB']) + num(r['CAND_LOANS']), 'cvg': r['CVG_END_DT']}
    return out, dict(skipped)


def filter_pas2(c):
    """Stream pas2<YY>.zip once, keep 24A/24C/24E rows (not memos) to a small file, delete the zip."""
    small = os.path.join(CACHE, f'pas2-{c}-24ACE.psv')
    if not os.path.exists(small):
        z, m = fetch(f'https://www.fec.gov/files/bulk-downloads/{c}/pas2{yy(c)}.zip', f'pas2{yy(c)}.zip')
        PC = ['CMTE_ID', 'AMNDT_IND', 'RPT_TP', 'TRANSACTION_PGI', 'IMAGE_NUM', 'TRANSACTION_TP', 'ENTITY_TP', 'NAME', 'CITY', 'STATE', 'ZIP_CODE', 'EMPLOYER',
              'OCCUPATION', 'TRANSACTION_DT', 'TRANSACTION_AMT', 'OTHER_ID', 'CAND_ID', 'TRAN_ID', 'FILE_NUM', 'MEMO_CD', 'MEMO_TEXT', 'SUB_ID']
        kept = 0
        with zipfile.ZipFile(z) as zf, zf.open([n for n in zf.namelist() if n.endswith('.txt')][0]) as src, open(small, 'w', newline='') as out:
            w = csv.writer(out, delimiter='|')
            for row in csv.reader(io.TextIOWrapper(src, encoding='latin-1', newline=''), delimiter='|'):
                if len(row) >= 20 and row[5] in ('24A', '24C', '24E'):
                    w.writerow([row[i] for i in (0, 1, 5, 13, 14, 16, 17, 18, 19)])
                    kept += 1
        os.remove(z)
        os.replace(z + '.meta.json', small + '.meta.json')
    m = json.load(open(small + '.meta.json'))
    register(f'pas2{yy(c)}', f'pas2{yy(c)}.zip', m, 'transaction types 24A, 24C, 24E only (memo rows dropped)')
    return small


def get_ie(c):
    if c < 2010:
        return None
    path, m = fetch(f'https://www.fec.gov/files/bulk-downloads/{c}/independent_expenditure_{c}.csv', f'independent_expenditure_{c}.csv')
    register(f'ie{c}', f'independent_expenditure_{c}.csv', m)
    return path


# ---------------------------------------------------------------- outside money
def pas2_rows(c):
    """(type, cand_id, usd) from pas2 24A/24C/24E, latest version per (committee, tran id), terminated and memo rows dropped."""
    best = {}
    for r in csv.reader(open(filter_pas2(c), newline=''), delimiter='|'):
        cmte, amnd, tp, dt, amt, cid, tid, fnum, memo = r
        if memo == 'X':
            continue
        k = (cmte, tid)
        if k not in best or int(fnum or 0) >= best[k][0]:
            best[k] = (int(fnum or 0), amnd, tp, cid, num(amt))
    return [(tp, cid, amt) for (fn, amnd, tp, cid, amt) in best.values() if amnd != 'T']


def ie_rows(c):
    """(sup_opp, cand_id, office, state, district, ele_type, usd) from the IE file, latest version per (committee, tran id)."""
    best, raw = {}, 0.0
    with open(get_ie(c), newline='', encoding='utf-8', errors='replace') as f:
        for r in csv.DictReader(f):
            raw += num(r['exp_amo'])
            k = (r['spe_id'], r['tran_id'])
            fn = int(r['file_num'] or 0)
            if k not in best or fn >= best[k][0]:
                best[k] = (fn, r)
    rows = [(r['sup_opp'], r['cand_id'], r['can_office'], r['can_office_state'], r['can_office_dis'], r['ele_type'], num(r['exp_amo']), r['cand_name'])
            for fn, r in best.values() if r['amndt_ind'] != 'T']
    return rows, raw


# ---------------------------------------------------------------- votes
def margin_flip(m):
    m = abs(int(m))
    return m // 2 + 1


def load_votes():
    """Senate {(year, st, special): (D, R, dName, rName, source)}; president {(year, st): (D, R, source)}."""
    sen, pres, checks = {}, {}, []
    msrc = os.path.join(CACHE, 'mit-senate-state-1976-2024.tab')
    p, m = fetch('https://dataverse.harvard.edu/api/access/datafile/13887039?format=original', 'mit-senate-state-1976-2024.tab')
    register('mit-senate', 'mit-senate-state-1976-2024.tab', m, 'MIT Election Data and Science Lab, U.S. Senate statewide 1976-2024, doi:10.7910/DVN/PEJ5QU (CC0)')
    cands = collections.defaultdict(lambda: collections.defaultdict(float))
    party = collections.defaultdict(lambda: collections.defaultdict(float))
    with open(msrc, newline='') as f:
        for r in csv.DictReader(f):
            if r['stage'].lower() != 'gen':
                continue
            k = (int(r['year']), r['state_po'], r['special'].lower() == 'true')
            v = num(r['candidatevotes'])
            cands[k][r['candidate']] += v
            party[k][(r['candidate'], r['party_simplified'])] += v
    for k, cs in cands.items():
        side = {}
        for (cand, p), v in party[k].items():
            if p in ('DEMOCRAT', 'REPUBLICAN') and v >= side.get(cand, ('', 0))[1]:
                side[cand] = (p, v)
        d = [(cs[c], c) for c, (p, v) in side.items() if p == 'DEMOCRAT']
        r_ = [(cs[c], c) for c, (p, v) in side.items() if p == 'REPUBLICAN']
        if d and r_:
            sen[k] = (int(max(d)[0]), int(max(r_)[0]), max(d)[1], max(r_)[1], 'mit-senate')
        else:
            sen[k] = None            # not a Democrat against a Republican
    sim = json.load(open(os.path.join(PAGE, 'simulator.json')))
    SRC_SIM = {'file': 'simulator.json', 'note': 'the page\'s own file, from build_simulator.py (certified results; 2026 not used here)'}
    SOURCES['simulator'] = SRC_SIM
    for ds, day in sim['days'].items():
        y = int(ds)
        if y > 2024:
            continue
        for r in day['senate']['races']:
            st = r['st']; special = r['id'].endswith('-special')
            k = (y, st, special)
            new = None if not r.get('rName') or not r.get('dName') or not r['R'] or not r['D'] else (int(r['D']), int(r['R']), r['dName'], r['rName'], 'simulator')
            old = sen.get(k, 'absent')
            if old == 'absent':
                if new:
                    checks.append(f'senate {k}: in simulator.json but not in the MIT file (simulator used)')
            elif new is None:
                if old is not None:
                    checks.append(f'senate {k}: simulator has no D-against-R pair; MIT has D {old[0]} R {old[1]} (MIT used)')
                    new = old
            elif old is None:
                checks.append(f'senate {k}: MIT has no D-against-R pair; simulator D {new[0]} R {new[1]} (simulator used)')
            elif (old[0], old[1]) != (new[0], new[1]):
                checks.append(f'senate {k}: votes differ, simulator D {new[0]} R {new[1]}, MIT D {old[0]} R {old[1]} (simulator used)')
            sen[k] = new
        for st, (d, r_, ev) in (day.get('pres') or {'states': {}})['states'].items():
            pres[(y, st)] = (int(d), int(r_), 'simulator')
    mp = os.path.join(HIST, 'president-by-state-1976-2024-mit.csv')
    SOURCES['mit-president'] = {'file': 'president-by-state-1976-2024-mit.csv (cascade-research/notes/data/vt-history)', 'note': 'MIT Election Data and Science Lab, U.S. President 1976-2024, doi:10.7910/DVN/42MVDX (CC0)'}
    with open(mp, newline='') as f:
        for r in csv.DictReader(f):
            y = int(r['year']); k = (y, r['state_po'])
            v = (int(r['democratic_votes']), int(r['republican_votes']), 'mit-president')
            if k in pres and pres[k][2] == 'simulator':
                if pres[k][:2] != v[:2]:
                    checks.append(f'president {k}: simulator D {pres[k][0]} R {pres[k][1]} vs MIT D {v[0]} R {v[1]}')
            else:
                pres[k] = v
    return sen, pres, checks


# ---------------------------------------------------------------- build
def fig(type_, what, usd, src):
    return {'type': type_, 'what': what, 'usd': round(usd, 2), 'src': src}


def ratios(spent, outside_all, d):
    out = {}
    if d['flip']:
        out['spentPerFlip'] = round(spent / d['flip'], 2)
        out['spentPlusOutsidePerFlip'] = round((spent + outside_all) / d['flip'], 2)
    if d.get('moved'):
        out['spentPerMoved'] = round(spent / d['moved'], 2)
        out['spentPlusOutsidePerMoved'] = round((spent + outside_all) / d['moved'], 2)
    return out


FEC_PUBLISHED = {
    2016: {'url': 'https://www.fec.gov/updates/statistical-summary-24-month-campaign-activity-2015-2016-election-cycle/', 'published': '2017-03-23',
           'coverage': '2015-01-01 to 2016-12-31', 'candidates': {'P': 110, 'S': 217, 'H+S': 1617},
           'receiptsMillions': {'P': 1539.1, 'S': 594.5, 'H+S': 1644.3}, 'disbursementsMillions': {'P': 1527.1, 'S': 625.3, 'H+S': 1597.0},
           'note': 'House receipts printed only as "$1 billion"; House disbursements $971.7 million'},
    2020: {'url': 'https://www.fec.gov/updates/statistical-summary-24-month-campaign-activity-2019-2020-election-cycle/', 'published': '2021-04-02',
           'coverage': '2019-01-01 to 2020-12-31', 'candidates': {'H+S': 2371},
           'receiptsMillions': {'P': 4073.9, 'H+S': 4005.3}, 'disbursementsMillions': {'P': 4071.9, 'H+S': 3765.2},
           'note': 'Senate and House printed only as rounded figures ($2 billion each); only the combined and presidential figures are exact'},
}


def fec_compare(totals):
    rows = {}
    for c, p in FEC_PUBLISHED.items():
        t = totals[c]
        ours = {'P': t.get('P'), 'S': t.get('S'), 'H+S': {k: (t['H'][k] + t['S'][k]) if k != 'candidates' else t['H'][k] + t['S'][k] for k in ('receipts', 'disbursements', 'candidates')}}
        r = {'fec': p, 'weball': {}}
        for k in p['receiptsMillions']:
            a = ours[k]
            r['weball'][k] = {'receiptsMillions': round(a['receipts'] / 1e6, 1), 'disbursementsMillions': round(a['disbursements'] / 1e6, 1), 'candidates': a['candidates'],
                              'receiptsDiffPct': round(100 * (a['receipts'] / 1e6 / p['receiptsMillions'][k] - 1), 1),
                              'disbursementsDiffPct': round(100 * (a['disbursements'] / 1e6 / p['disbursementsMillions'][k] - 1), 1) if k in p['disbursementsMillions'] else None}
        rows[str(c)] = r
    return rows


def main():
    sen_votes, pres_votes, vote_checks = load_votes()
    out = {'method': __doc__.strip().split('\n\n')[0], 'cycles': CYCLES, 'senate': [], 'president': [], 'checks': {}, 'unmapped': {}}
    cand_by_cycle = {}
    totals = {}
    for c in CYCLES:
        cands, skipped = load_cycle_candidates(c)
        cand_by_cycle[c] = cands
        t = collections.defaultdict(lambda: [0.0, 0.0, 0])
        for x in cands.values():
            t[x['office']][0] += x['receipts']; t[x['office']][1] += x['disb']; t[x['office']][2] += 1
        totals[c] = {o: {'receipts': round(v[0], 2), 'disbursements': round(v[1], 2), 'candidates': v[2]} for o, v in t.items()}
        totals[c]['skippedOtherElectionYear'] = skipped
    # outside money by race
    out_sen = collections.defaultdict(lambda: collections.defaultdict(float))     # (c, st) -> kind -> usd
    out_pres = collections.defaultdict(float)
    unm = collections.defaultdict(lambda: collections.defaultdict(float))
    ie_raw = {}
    for c in CYCLES:
        cands = {k: v for k, v in cand_by_cycle[c].items() if v['receipts'] >= THRESH or v['disb'] >= THRESH}
        pres_surnames = {x['name'].split(',')[0].strip().upper() for x in cands.values() if x['office'] == 'P'}
        sen_states = {x['st'] for x in cands.values() if x['office'] == 'S'}
        def race_of(cid, office, st, name=''):
            """Race an IE row belongs to, as (office, state), or (None, None) when it is left out (and counted under unmapped).
            1. the candidate id is on the cycle file with at least $5,000: that candidate's race;
            2. the id is on the cycle file but below $5,000: left out (this is where the file's bogus filings sit);
            3. the id is not on the cycle file (a mistyped or other-year id) or the row has none: the row's own office and state for a
               Senate row in a state with a qualifying Senate candidate; a presidential row whose surname matches a qualifying
               presidential candidate; otherwise left out."""
            if cid in cands:
                return cands[cid]['office'], cands[cid]['st']
            if cid and cid in cand_by_cycle[c]:
                return None, None
            if office == 'S' and st in sen_states:
                return 'S', st
            if office == 'P' and name.split(',')[0].strip().upper() in pres_surnames:
                return 'P', ''
            return (office, st) if office == 'H' else (None, None)
        if c >= 2010:
            rows, raw = ie_rows(c); ie_raw[c] = round(raw, 2)
            for so, cid, off, st, dis, et, usd, nm in rows:
                o, s = race_of(cid, off, st, nm)
                if o is None:
                    unm[c]['EXCLUDED: IE row left out (candidate under $5,000, or id and row fields match no qualifying candidate)'] += usd
                elif o == 'S' and s:
                    out_sen[(c, s)]['ie_support' if so == 'S' else 'ie_oppose'] += usd
                elif o == 'P':
                    out_pres[(c, 'ie_support' if so == 'S' else 'ie_oppose')] += usd
                elif o == 'H':
                    unm[c]['house IE not used (no House output)'] += usd
                else:
                    unm[c]['IE row with no candidate id and no office'] += usd
            srcie = f'ie{c}'
        else:
            srcie = 'pas208'
        for tp, cid, usd in pas2_rows(c):
            x = cands.get(cid)
            if tp == '24C':
                if x and x['office'] == 'S':
                    out_sen[(c, x['st'])]['party_coord'] += usd
                elif x and x['office'] == 'P':
                    out_pres[(c, 'party_coord')] += usd
                elif not x:
                    unm[c]['EXCLUDED: 24C row whose candidate is not on the cycle file or has under $5,000'] += usd
            elif c < 2010:       # 2008: Schedule E rows in pas2 stand in for the IE file
                if x and x['office'] == 'S':
                    out_sen[(c, x['st'])]['ie_support' if tp == '24E' else 'ie_oppose'] += usd
                elif x and x['office'] == 'P':
                    out_pres[(c, 'ie_support' if tp == '24E' else 'ie_oppose')] += usd
                elif not x:
                    unm[c]['EXCLUDED: 2008 Schedule E row whose candidate is not on the cycle file or has under $5,000'] += usd
    # Senate races
    for c in CYCLES:
        by_state = collections.defaultdict(list)
        for x in cand_by_cycle[c].values():
            if x['office'] == 'S':
                by_state[x['st']].append(x)
        races = sorted(k for k in sen_votes if k[0] == c)
        for k in races:
            _, st, special = k
            v = sen_votes[k]
            two = len([1 for kk in sen_votes if kk[0] == c and kk[1] == st]) > 1
            race = {'cycle': c, 'st': st, 'special': special}
            if v:
                race['votes'] = {'D': v[0], 'R': v[1], 'dName': v[2], 'rName': v[3], 'src': v[4]}
                d = {'flip': margin_flip(v[0] - v[1])}
                race['marginDminusR'] = v[0] - v[1]
                prev = None if special else sen_votes.get((c - 6, st, False))
                if prev:
                    d['moved'] = abs((v[0] - v[1]) - (prev[0] - prev[1]))
                    d['movedFrom'] = c - 6
                    d['movedSigned'] = (v[0] - v[1]) - (prev[0] - prev[1])
                race['decisive'] = d
            else:
                race['votes'] = None
                race['voteNote'] = 'not a Democrat against a Republican: no margin, no decisive votes'
            if two:
                race['money'] = None
                race['moneyNote'] = 'two Senate races in this state this cycle: the FEC candidate files do not name the seat, so dollars are not assigned'
            else:
                cs = by_state.get(st, [])
                o = out_sen.get((c, st), {})
                m = [fig('raised', 'candidate total receipts', sum(x['receipts'] for x in cs), f'weball{yy(c)}'),
                     fig('raised', 'of which transfers from other authorized committees', sum(x['transIn'] for x in cs), f'weball{yy(c)}'),
                     fig('raised', 'of which candidate contributions and candidate loans', sum(x['self'] for x in cs), f'weball{yy(c)}'),
                     fig('spent', 'candidate total disbursements', sum(x['disb'] for x in cs), f'weball{yy(c)}'),
                     fig('spent', 'of which transfers to other authorized committees', sum(x['transOut'] for x in cs), f'weball{yy(c)}'),
                     fig('outside', 'independent expenditures supporting the race\'s candidates', o.get('ie_support', 0), f'ie{c}' if c >= 2010 else 'pas208'),
                     fig('outside', 'independent expenditures opposing the race\'s candidates', o.get('ie_oppose', 0), f'ie{c}' if c >= 2010 else 'pas208'),
                     fig('outside', 'party coordinated expenditures', o.get('party_coord', 0), f'pas2{yy(c)}')]
                race['money'] = m
                race['candidates'] = len(cs)
                if v:
                    spent = m[3]['usd']
                    outs = m[5]['usd'] + m[6]['usd'] + m[7]['usd']
                    race['dollarsPerDecisiveVote'] = ratios(spent, outs, race['decisive'])
            out['senate'].append(race)
    # President: national money, votes by state
    for c in CYCLES:
        cs = [x for x in cand_by_cycle[c].values() if x['office'] == 'P']
        if not cs:
            continue
        cs.sort(key=lambda x: -x['receipts'])
        states = []
        for (y, st), (d, r_, src) in sorted(pres_votes.items()):
            if y != c:
                continue
            e = {'st': st, 'D': d, 'R': r_, 'marginDminusR': d - r_, 'flip': margin_flip(d - r_), 'src': src}
            p = pres_votes.get((c - 4, st))
            if p:
                e['moved'] = abs((d - r_) - (p[0] - p[1])); e['movedFrom'] = c - 4; e['movedSigned'] = (d - r_) - (p[0] - p[1])
            states.append(e)
        tipping = None
        hist = json.load(open(os.path.join(PAGE, 'history.json')))
        for b in hist['bias']:
            if b['year'] == c:
                tipping = {'st': b['tip']['st'], 'votesDminusR': b['tip']['votes'], 'flip': margin_flip(b['tip']['votes']), 'src': 'history.json bias'}
        spent = sum(x['disb'] for x in cs)
        o = {k[1]: v for k, v in out_pres.items() if k[0] == c}
        srcp = f'ie{c}' if c >= 2010 else 'pas208'
        m = [fig('raised', 'candidate total receipts, all presidential candidates', sum(x['receipts'] for x in cs), f'weball{yy(c)}'),
             fig('spent', 'candidate total disbursements, all presidential candidates', spent, f'weball{yy(c)}'),
             fig('outside', 'independent expenditures supporting presidential candidates', o.get('ie_support', 0), srcp),
             fig('outside', 'independent expenditures opposing presidential candidates', o.get('ie_oppose', 0), srcp),
             fig('outside', 'party coordinated expenditures', o.get('party_coord', 0), f'pas2{yy(c)}')]
        race = {'cycle': c, 'scope': 'national: the FEC candidate and independent-expenditure files carry no presidential dollars by state', 'money': m,
                'candidates': len(cs), 'topByReceipts': [{'id': x['id'], 'name': x['name'], 'party': x['party'], 'raised': x['receipts'], 'spent': x['disb']} for x in cs[:6]],
                'states': states, 'tippingState': tipping}
        if tipping:
            outs = m[2]['usd'] + m[3]['usd'] + m[4]['usd']
            race['usdPerTippingStateFlipVote'] = {'spent': round(spent / tipping['flip'], 2), 'spentPlusOutside': round((spent + outs) / tipping['flip'], 2),
                                                  'note': 'national dollars over the tipping state\'s votes to flip; not a per-state dollar figure'}
        out['president'].append(race)
    # checks
    out['checks'] = {
        'voteSources': vote_checks if vote_checks else 'simulator.json and the MIT files agree on every overlapping race',
        'candidateTotalsByCycle': totals,
        'independentExpenditureRawSumBeforeDedupe': ie_raw,
        'fecPublished': fec_compare(totals),
    }
    out['unmapped'] = {str(c): {k: round(v, 2) for k, v in d.items()} for c, d in unm.items()}
    out['house'] = None
    out['houseNote'] = ('House races are not in this file. At about 1.1 KB a race (Senate 315 races, president 255 state rows = 421 KB), 2008-2024 House '
                        'races (about 3,900) would be about 4 MB, over the 300 KB limit set for this build; and the page holds House votes only for 2022-2026 (house.json), '
                        'so earlier races would have money but no decisive votes. Candidate totals for House candidates are in checks.candidateTotalsByCycle.')
    out['unreported'] = ('Not in these files and not estimated: spending by organizations that are not required to report it to the FEC as an independent expenditure '
                         '(for example issue advertising, and spending by 501(c) groups that does not name a candidate); contributions to those groups; '
                         'state-party and state-committee spending reported to states; money raised after the file\'s coverage date; independent expenditures whose '
                         'candidate id and race fields are both blank (listed under "unmapped"); House races (not built here).')
    out['sources'] = SOURCES
    out['definitions'] = {'flip': 'floor(|D-R margin| / 2) + 1', 'moved': '|change in D-R margin since the previous race for the same seat|; Senate six years earlier (regular elections), president four years earlier',
                          'figureTypes': {'raised': 'money received by the candidates\' committees', 'spent': 'money disbursed by the candidates\' committees', 'outside': 'spent by others for or against the candidates, reported to the FEC'}}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f'wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB): {len(out["senate"])} Senate races, {len(out["president"])} presidential cycles, '
          f'{sum(len(p["states"]) for p in out["president"])} state rows')
    return out


if __name__ == '__main__':
    main()
