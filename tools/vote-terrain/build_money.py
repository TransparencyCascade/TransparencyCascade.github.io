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
import csv, collections, datetime, io, json, os, re, subprocess, sys, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '../..'))
args = sys.argv[1:]
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
CACHE = os.path.abspath(opt('--cache', os.path.join(HERE, '.fec-cache')))
OUT = os.path.abspath(opt('--out', os.path.join(REPO, 'static/maps/vote-terrain/money.json')))
PAGE = os.path.dirname(OUT)
HIST = os.path.expanduser('~/tcp-kb-internal/cascade-research/notes/data/vt-history')
CYCLES = list(range(2008, 2028, 2))      # 2026 is partial: filings through the files' dates (see 'coverage' in the output)
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
    """(type, cand_id, usd, committee) from pas2 24A/24C/24E, latest version per (committee, tran id), terminated and memo rows dropped."""
    best = {}
    for r in csv.reader(open(filter_pas2(c), newline=''), delimiter='|'):
        cmte, amnd, tp, _dt, amt, cid, tid, fnum, memo = r
        if memo == 'X':
            continue
        k = (cmte, tid)
        if k not in best or int(fnum or 0) >= best[k][0]:
            best[k] = (int(fnum or 0), amnd, tp, cid, num(amt), cmte)
    return [(tp, cid, amt, cmte) for (_fn, amnd, tp, cid, amt, cmte) in best.values() if amnd != 'T']


def ie_rows(c):
    """(sup_opp, cand_id, office, state, district, ele_type, usd) from the IE file, latest version per (committee, tran id)."""
    best, raw = {}, 0.0
    path = get_ie(c)
    assert path, 'no independent expenditure file before 2010'
    with open(path, newline='', encoding='utf-8', errors='replace') as f:
        for r in csv.DictReader(f):
            raw += num(r['exp_amo'])
            k = (r['spe_id'], r['tran_id'])
            fn = int(r['file_num'] or 0)
            if k not in best or fn >= best[k][0]:
                best[k] = (fn, r)
    rows = [(r['sup_opp'], r['cand_id'], r['can_office'], r['can_office_state'], r['can_office_dis'], r['ele_type'], num(r['exp_amo']), r['cand_name'], r['spe_id'],
             r['exp_date'] or r['dissem_dt'])
            for _fn, r in best.values() if r['amndt_ind'] != 'T']
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
        d = [(cs[c], c) for c, (p, _) in side.items() if p == 'DEMOCRAT']
        r_ = [(cs[c], c) for c, (p, _) in side.items() if p == 'REPUBLICAN']
        if d and r_:
            sen[k] = (int(max(d)[0]), int(max(r_)[0]), max(d)[1], max(r_)[1], 'mit-senate')
        else:
            sen[k] = None            # not a Democrat against a Republican
    sim = json.load(open(os.path.join(PAGE, 'simulator.json')))
    SRC_SIM = {'file': 'simulator.json', 'note': 'the page\'s own file, from build_simulator.py (certified results 2016-2024; 2026 is the unofficial AP-via-CNN feed, flagged unofficial on each race)'}
    SOURCES['simulator'] = SRC_SIM
    for ds, day in sim['days'].items():
        y = int(ds)
        for r in day['senate']['races']:
            st = r['st']; special = r['id'].endswith('-special')
            k = (y, st, special)
            new = None if not r.get('rName') or not r.get('dName') or not r['R'] or not r['D'] else (int(r['D']), int(r['R']), r['dName'], r['rName'], 'simulator' if y < 2026 else 'simulator-unofficial')
            old = sen.get(k, 'absent')
            if old == 'absent':
                if new and y < 2026:
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
        for st, (d, r_, _ev) in (day.get('pres') or {'states': {}})['states'].items():
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



# ---------------------------------------------------------------- per-filing summaries (F3X) for the same-date comparison
# The FEC's committee summary files (webk, committee_summary) carry one row per committee and cycle, as of the file's date, so they cannot say what a
# cycle held on a given day. The electronically filed reports can: each F3X (PAC and party report) states its coverage dates and the calendar year to
# date (column B). The FEC publishes every filing in a daily zip (bulk-downloads/electronic/<YYYYMMDD>.zip); only the first few KB of each .fec file are
# needed (the F3X line is the second line), so each is read with an HTTP range request into the zip, never downloaded whole.
EFILE = 'https://cg-519a459a-0ea3-42c2-b7bc-fa1143481f74.s3-us-gov-west-1.amazonaws.com/bulk-downloads/electronic/'
ELECTION_DAY = {2022: '2022-11-08', 2024: '2024-11-05', 2026: '2026-11-03'}
PRE_GENERAL = {2022: '2022-10-19', 2024: '2024-10-16', 2026: '2026-10-14'}      # the pre-general report's coverage end: 20 days before the election
# F3X field numbers (FEC format v8, 1-based): column A (this report) and column B (calendar year to date)
F3X_A = {'receipts': 24, 'disb': 26, 'tin': 36, 'tout': 51, 'cands': 52, 'ie': 53, 'coord': 54}
F3X_B = {'year': 75, 'receipts': 76, 'disb': 78, 'tin': 86, 'tout': 101, 'cands': 102, 'ie': 103, 'coord': 104}
F3X_COLS = ['filing', 'day', 'form', 'cmte', 'from', 'thru', 'rpt'] + ['a_' + k for k in F3X_A] + ['b_' + k for k in F3X_B]


def _rng(url, a, b, method='GET'):
    err = None
    for _ in range(5):
        try:
            req = urllib.request.Request(url, headers={'Range': f'bytes={a}-{b}', **UA})
            return urllib.request.urlopen(req, timeout=90).read()
        except Exception as e:      # noqa: BLE001 - retried, then raised
            err = e
    raise err


def _zip_entries(url):
    """(name, method, compressed size, local header offset) for every member, from the zip's central directory (read with two or three range requests)."""
    import struct
    req = urllib.request.Request(url, method='HEAD', headers=UA)
    n = int(urllib.request.urlopen(req, timeout=90).headers['Content-Length'])
    tail = _rng(url, max(0, n - 70000), n - 1)
    i = tail.rfind(b'PK\x05\x06')
    cnt, csz, coff = struct.unpack('<H', tail[i + 10:i + 12])[0], struct.unpack('<I', tail[i + 12:i + 16])[0], struct.unpack('<I', tail[i + 16:i + 20])[0]
    if cnt == 0xFFFF or coff == 0xFFFFFFFF:
        j = tail.rfind(b'PK\x06\x07')
        z64 = struct.unpack('<Q', tail[j + 8:j + 16])[0]
        rec = _rng(url, z64, z64 + 55)
        cnt, csz, coff = struct.unpack('<Q', rec[32:40])[0], struct.unpack('<Q', rec[40:48])[0], struct.unpack('<Q', rec[48:56])[0]
    cd = _rng(url, coff, coff + csz - 1)
    out, p = [], 0
    for _ in range(cnt):
        (_sig, _vm, _vn, _fl, meth, _mt, _md, _crc, cs, us, nl, el, cl, _dn, _ia, _ea, lo) = struct.unpack('<IHHHHHHIIIHHHHHII', cd[p:p + 46])
        name = cd[p + 46:p + 46 + nl].decode('latin1')
        ex = cd[p + 46 + nl:p + 46 + nl + el]
        if lo == 0xFFFFFFFF or cs == 0xFFFFFFFF:
            q = 0
            while q < len(ex):
                tid, ts = struct.unpack('<HH', ex[q:q + 4])
                if tid == 1:
                    f, k = ex[q + 4:q + 4 + ts], 0
                    if us == 0xFFFFFFFF:
                        k += 8
                    if cs == 0xFFFFFFFF:
                        cs = struct.unpack('<Q', f[k:k + 8])[0]; k += 8
                    if lo == 0xFFFFFFFF:
                        lo = struct.unpack('<Q', f[k:k + 8])[0]
                q += 4 + ts
        out.append((name, meth, cs, lo)); p += 46 + nl + el + cl
    return out


def _fec_head(url, ent, nbytes=4000):
    import struct, zlib
    _name, meth, _cs, lo = ent
    b = _rng(url, lo, lo + 30 + 300 + nbytes + 1500)
    nl, el = struct.unpack('<HH', b[26:30])
    d = b[30 + nl + el:]
    return d[:nbytes] if meth == 0 else zlib.decompressobj(-15).decompress(d, nbytes)


def _f3x_row(name, day, head):
    """The F3X summary of one .fec file (None when the filing is another form)."""
    lines = head.split(b'\n')
    if len(lines) < 3:
        return None
    delim = b'\x1c' if lines[0].startswith(b'HDR\x1c') else b','
    f = lines[1].decode('latin1').split(delim.decode('latin1'))
    if not f[0].startswith('F3X') or len(f) < 104:
        return None
    g = lambda n: f[n - 1].strip()
    return [name[:-4], day, f[0], g(2), g(14), g(15), g(10)] + [g(n) for n in F3X_A.values()] + [g(n) for n in F3X_B.values()]


def get_f3x(c, days=None):
    """F3X summaries of every PAC and party report filed from 1 January of cycle year c to its election day (see ELECTION_DAY), cached by day in
    CACHE/f3x/<YYYYMMDD>.psv. Returns {(cmte, filing): dict}."""
    from concurrent.futures import ThreadPoolExecutor
    d0, d1 = datetime.date(c, 1, 1), datetime.date.fromisoformat(ELECTION_DAY[c])
    cdir = os.path.join(CACHE, 'f3x')
    os.makedirs(cdir, exist_ok=True)
    dl = [d0 + datetime.timedelta(i) for i in range((d1 - d0).days + 1)]

    def one_day(d):
        ds = d.strftime('%Y%m%d')
        path = os.path.join(cdir, ds + '.psv')
        if os.path.exists(path):
            return
        url = EFILE + ds + '.zip'
        try:
            ents = _zip_entries(url)
        except Exception as e:      # noqa: BLE001
            print(f'  {ds}: no zip ({e})', file=sys.stderr); return
        got = []
        with ThreadPoolExecutor(12) as ex:
            for ent, h in zip(ents, ex.map(lambda e: _fec_head(url, e), ents)):
                r = _f3x_row(ent[0], d.isoformat(), h)
                if r:
                    got.append(r)
        with open(path + '.tmp', 'w') as fh:
            fh.write('\n'.join('|'.join(r) for r in got) + ('\n' if got else ''))
        os.replace(path + '.tmp', path)
        print(f'  {ds}: {len(ents)} filings, {len(got)} F3X', flush=True)
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(one_day, dl))
    rows = []
    for d in dl:
        path = os.path.join(cdir, d.strftime('%Y%m%d') + '.psv')
        if not os.path.exists(path):
            raise SystemExit(f'missing {path}: rerun')
        for ln in open(path):
            if ln.strip():
                rows.append(dict(zip(F3X_COLS, ln.rstrip('\n').split('|'))))
    return rows


# ---------------------------------------------------------------- committee totals and donors
WK_COLS = ['CMTE_ID', 'CMTE_NM', 'CMTE_TP', 'CMTE_DSGN', 'CMTE_FILING_FREQ', 'TTL_RECEIPTS', 'TRANS_FROM_AFF', 'INDV_CONTRIB', 'OTHER_POL_CMTE_CONTRIB',
           'CAND_CONTRIB', 'CAND_LOANS', 'TTL_LOANS_RECEIVED', 'TTL_DISB', 'TRANF_TO_AFF', 'INDV_REFUNDS', 'OTHER_POL_CMTE_REFUNDS', 'CAND_LOAN_REPAY',
           'LOAN_REPAY', 'COH_BOP', 'COH_COP', 'DEBTS_OWED_BY', 'NONFED_TRANS_RECEIVED', 'CONTRIB_TO_OTHER_CMTE', 'IND_EXP', 'PTY_COORD_EXP',
           'NONFED_SHARE_EXP', 'CVG_END_DT']
# ActBlue and WinRed are committee type V (hybrid) but pass earmarked gifts through to candidates and committees: their
# billions are conduit traffic, not outside spending, so they are listed apart and left out of the hybrid totals.
CONDUITS = {'C00401224': 'ActBlue', 'C00694323': 'WinRed'}
GROUPS = [('superPac', 'independent-expenditure-only committees (super PACs, committee type O)'),
          ('hybrid', 'hybrid PACs (types V and W, without the two conduits)'),
          ('party', 'party committees (types Y and Z)'),
          ('conduit', 'ActBlue and WinRed (type V; earmarked gifts passed through; not counted as outside money)')]


def group_of(r):
    if r['CMTE_ID'] in CONDUITS:
        return 'conduit'
    return {'O': 'superPac', 'V': 'hybrid', 'W': 'hybrid', 'Y': 'party', 'Z': 'party'}.get(r['CMTE_TP'])


def iso_mdy(s):
    """FEC MMDDYYYY (or M/D/YYYY) to ISO; '' when it is not a date."""
    m = re.match(r'^(\d{1,2})/?(\d{1,2})/?(\d{4})$', s or '')
    return f'{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}' if m else ''


def iso_ymd(s):
    """YYYYMMDD to ISO."""
    return f'{s[:4]}-{s[4:6]}-{s[6:8]}' if len(s) == 8 else ''


def get_webk(c):
    txt = os.path.join(CACHE, f'webk{yy(c)}.txt')
    if not os.path.exists(txt) or not os.path.exists(txt + '.meta.json'):
        z, m = fetch(f'https://www.fec.gov/files/bulk-downloads/{c}/webk{yy(c)}.zip', f'webk{yy(c)}.zip')
        unzip_member(z, r'\.txt$', txt)
        os.replace(z + '.meta.json', txt + '.meta.json')
    m = json.load(open(txt + '.meta.json'))
    register(f'webk{yy(c)}', f'webk{yy(c)}.zip', m, 'PAC and party summary file: one row per committee, totals for the two-year cycle')
    return [r for r in read_pipe(txt, WK_COLS)]


def stream_indiv(c, ids):
    """Itemized individual contributions (indiv<YY>.zip, Schedule A line 11A) to the given committees. The zip is 0.1 to 5.9 GB, so it is
    streamed (curl into bsdtar into this filter) and never written to disk; only the rows for these committees are kept, to a small file."""
    small = os.path.join(CACHE, f'indiv-{c}-superpac.psv')
    meta = small + '.meta.json'
    if not os.path.exists(small) or not os.path.exists(meta):
        url = f'https://www.fec.gov/files/bulk-downloads/{c}/indiv{yy(c)}.zip'
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA, method='HEAD'), timeout=120) as r:
            lm = r.headers.get('Last-Modified')
        want = {i.encode() for i in ids}
        cu = subprocess.Popen(['curl', '-sSL', '--fail', '-A', UA['User-Agent'], url], stdout=subprocess.PIPE)
        bt = subprocess.Popen(['bsdtar', '-xOf', '-'], stdin=cu.stdout, stdout=subprocess.PIPE)
        assert cu.stdout and bt.stdout
        cu.stdout.close()
        kept = 0
        with open(small + '.part', 'wb') as out:
            for line in bt.stdout:
                if line[:9] in want:
                    out.write(line); kept += 1
        if bt.wait() != 0 or cu.wait() != 0:
            os.remove(small + '.part')
            raise RuntimeError(f'streaming {url} failed')
        os.replace(small + '.part', small)
        json.dump({'url': url, 'retrieved': datetime.date.today().isoformat(), 'lastModified': lm, 'kept': kept}, open(meta, 'w'))
    m = json.load(open(meta))
    register(f'indiv{yy(c)}', f'indiv{yy(c)}.zip', m, 'itemized contributions from individuals and other non-committee persons; streamed, only rows for super PAC recipients kept')
    return small


INDIV_COLS = ['CMTE_ID', 'AMNDT_IND', 'RPT_TP', 'TRANSACTION_PGI', 'IMAGE_NUM', 'TRANSACTION_TP', 'ENTITY_TP', 'NAME', 'CITY', 'STATE', 'ZIP_CODE', 'EMPLOYER',
              'OCCUPATION', 'TRANSACTION_DT', 'TRANSACTION_AMT', 'OTHER_ID', 'TRAN_ID', 'FILE_NUM', 'MEMO_CD', 'MEMO_TEXT', 'SUB_ID']


TITLES = {'MR', 'MRS', 'MS', 'MISS', 'DR', 'HON', 'SEN', 'REP', 'PROF', 'JR', 'SR', 'II', 'III', 'IV', 'ESQ', 'MD', 'PHD'}
ORG_WORDS = re.compile(r'\b(ASSOCIATION|ASSN|FUND|PAC|COMMITTEE|INC|LLC|LP|LLP|CORP|CORPORATION|COMPANY|PARTNERS|PARTNERSHIP|TRUST|FOUNDATION|UNION|LOCAL|COUNCIL|FEDERATION|'
                       r'ADVOCACY|PARTY|BANK|GROUP|CLUB|SOCIETY|NETWORK|ENTERPRISES|HOLDINGS|CAPITAL|ALLIANCE|COALITION|INSTITUTE|AMERICA)\b')


def person_key(n, st):
    """(surname, first name, state) for an entry filed as an individual ('LAST, FIRST ...'), titles and suffixes dropped; None when the name is not a person's
    (no comma, or a word an organisation's name carries): such entries are totalled with the organisations. The FEC has no donor id, so one surname, first name and
    state is one donor here (a middle initial or 'MR.' does not make a second one; two different people sharing all three would be merged)."""
    up = re.sub(r'\s+', ' ', re.sub(r'[^A-Z, ]', ' ', (n or '').upper())).strip()
    if ',' not in up or ORG_WORDS.search(up):
        return None
    sur, rest = up.split(',', 1)
    toks = [t for t in rest.split() if t not in TITLES]
    return (sur.strip(), toks[0] if toks else '', st)


def display_name(n):
    return ' '.join(t for t in re.sub(r'\s+', ' ', n.strip()).split(' ') if t.strip('.').upper() not in TITLES)


def donor_stats(c, sp):
    """Donor concentration for super PAC receipts in cycle c. sp: webk rows of the type O committees. Lines are deduplicated to the latest version per
    (committee, transaction), terminated rows dropped. Individuals (entity type IND) are keyed by upper-cased name and state (the FEC has no donor id, so
    two people of one name in one state are one donor here); memo lines (MEMO_CD X) are attributions, not additive, and are totalled apart;
    organisations (companies, LLCs, committees) are totalled apart and never ranked among individuals."""
    ids = {r['CMTE_ID'] for r in sp}
    path = stream_indiv(c, ids)
    cn = {r['CMTE_ID']: r['CMTE_NM'] for r in sp}
    best = {}
    for row in csv.reader(open(path, newline='', encoding='latin-1'), delimiter='|'):
        if len(row) < 20:
            continue
        r = dict(zip(INDIV_COLS, row))
        k = (r['CMTE_ID'], r['TRAN_ID'] or r['SUB_ID'])
        fn = int(r['FILE_NUM'] or 0)
        if k not in best or fn >= best[k][0]:
            best[k] = (fn, r)
    types = collections.Counter()
    don = {}
    org_total = memo_org = 0.0     # organisations: companies, LLCs, associations and entries whose name is not a person's
    last = ''
    n_lines = 0
    cap = datetime.date.today().isoformat() if c == 2026 else f'{c + 1}-03-31'
    # America PAC: the bulk file runs behind the committee summary for 2026, so its Q3 and pre-general lines are not in it. Where the research note's receipts CSV
    # runs later than the bulk file for this committee, the committee's bulk rows are replaced by the CSV's (the note read the July to October lines from the filings).
    extra, swapped = america_lines() if c == 2026 else ([], None)
    bulk_rows = [r for _fn, r in best.values()]
    if extra:
        bulk_last = max((iso_mdy(r['TRANSACTION_DT']) for r in bulk_rows if r['CMTE_ID'] == AMERICA_PAC), default='')
        if bulk_last < max(e['date'] for e in extra):
            states = {r['NAME'].strip().upper(): r['STATE'] for r in bulk_rows if r['CMTE_ID'] == AMERICA_PAC}
            dropped = sum(num(r['TRANSACTION_AMT']) for r in bulk_rows if r['CMTE_ID'] == AMERICA_PAC and r['MEMO_CD'] != 'X' and r['ENTITY_TP'] == 'IND')
            bulk_rows = [r for r in bulk_rows if r['CMTE_ID'] != AMERICA_PAC]
            for e in extra:
                bulk_rows.append({'CMTE_ID': AMERICA_PAC, 'AMNDT_IND': 'N', 'RPT_TP': '', 'TRANSACTION_TP': '15', 'ENTITY_TP': e['entity'], 'NAME': e['name'], 'STATE': states.get(e['name'].upper(), ''),
                                  'TRANSACTION_DT': e['date'][5:7] + e['date'][8:10] + e['date'][:4], 'TRANSACTION_AMT': str(e['usd']), 'FILE_NUM': e['filing'], 'IMAGE_NUM': '',
                                  'MEMO_CD': 'X' if e['memo'] else '', 'EMPLOYER': ''})
            swapped = {'committee': AMERICA_PAC, 'bulkLinesThrough': bulk_last, 'researchLinesThrough': max(e['date'] for e in extra), 'bulkIndividualCashReplacedUsd': round(dropped, 2),
                       'reason': 'the bulk indiv file has no America PAC lines after its processing date; its rows are replaced by the research note\'s lines, which were read from the Q3 and pre-general filings'}
    for r in bulk_rows:
        if r['AMNDT_IND'] == 'T':
            continue
        amt = num(r['TRANSACTION_AMT'])
        tp = r['TRANSACTION_TP']
        types[tp] += 1
        if tp.startswith('22'):         # a refund of a contribution: reduces the donor's total
            amt = -abs(amt)
        memo = r['MEMO_CD'] == 'X'
        dt = iso_mdy(r['TRANSACTION_DT'])
        if dt and dt <= cap and dt > last:
            last = dt
        pk = person_key(r['NAME'], r['STATE']) if r['ENTITY_TP'] == 'IND' else None
        if pk is None:
            if memo:
                memo_org += amt
            else:
                org_total += amt
            continue
        n_lines += 1
        d = don.setdefault(pk, {'name': display_name(r['NAME']), 'best': 0.0, 'state': r['STATE'], 'cash': 0.0, 'memo': 0.0, 'cashLines': 0, 'memoLines': 0, 'by': collections.defaultdict(float),
                                'lines': [], 'memoList': [], 'first': '9999', 'last': '', 'employer': collections.Counter(), 'variants': set()})
        d['variants'].add(r['NAME'].strip())
        if abs(amt) > d['best']:
            d['best'] = abs(amt); d['name'] = display_name(r['NAME'])
        if memo:
            d['memo'] += amt; d['memoLines'] += 1
            d['memoList'].append((amt, dt, r['FILE_NUM'], r['CMTE_ID'], r['IMAGE_NUM'], r['RPT_TP']))
            continue
        d['cash'] += amt; d['cashLines'] += 1; d['by'][r['CMTE_ID']] += amt
        d['employer'][(r['EMPLOYER'] or '').strip()] += 1
        d['lines'].append((amt, dt, r['FILE_NUM'], r['CMTE_ID'], r['IMAGE_NUM'], r['RPT_TP']))
        if dt:
            d['first'] = min(d['first'], dt); d['last'] = max(d['last'], dt)
    ranked = sorted(don.values(), key=lambda d: -d['cash'])
    receipts = sum(num(r['TTL_RECEIPTS']) for r in sp)
    indv = sum(num(r['INDV_CONTRIB']) for r in sp)
    cash_all = sum(d['cash'] for d in don.values())
    top = lambda n: sum(d['cash'] for d in ranked[:n])
    big = [d for d in ranked if d['cash'] >= 1e6 or d['memo'] >= 1e6]
    named = []
    for d in sorted(big, key=lambda d: (d['cash'] < 1e6, -(d['cash'] if d['cash'] >= 1e6 else d['memo'])))[:25]:     # cash donors by cash, then memo-only by the memo-attributed amount
        lines = sorted(d['lines'], reverse=True)[:4]
        mlines = sorted(d['memoList'], reverse=True)[:3]
        named.append({'name': d['name'], 'state': d['state'], 'employer': (d['employer'].most_common(1) or [('', 0)])[0][0],
                      'cashUsd': round(d['cash'], 2), 'cashLines': d['cashLines'], 'memoAttributedUsd': round(d['memo'], 2), 'memoLines': d['memoLines'],
                      'firstDate': d['first'] if d['cashLines'] else '', 'lastDate': d['last'],
                      'filings': len({ln[2] for ln in d['lines']}),
                      'topCommittees': [{'id': i, 'name': cn.get(i, ''), 'usd': round(v, 2)} for i, v in sorted(d['by'].items(), key=lambda kv: -kv[1])[:3]],
                      'nameVariants': len(d['variants']),
                      'largestLines': [{'usd': round(a, 2), 'date': dt, 'filing': f, 'committee': cm, 'committeeName': cn.get(cm, ''), 'image': im, 'report': rp} for a, dt, f, cm, im, rp in lines],
                      'largestMemoLines': [{'usd': round(a, 2), 'date': dt, 'filing': f, 'committee': cm, 'committeeName': cn.get(cm, ''), 'image': im, 'report': rp} for a, dt, f, cm, im, rp in mlines]})
    return {'superPacReceiptsUsd': round(receipts, 2), 'superPacIndividualContributionsUsd': round(indv, 2),
            'itemizedIndividualCashUsd': round(cash_all, 2), 'itemizedIndividualDonors': len(don), 'itemizedIndividualLines': n_lines,
            'itemizedIndividualShareOfIndividualContributions': round(cash_all / indv, 4) if indv else None,
            'itemizedOrganizationUsd': round(org_total, 2), 'memoLinesOrganizationUsd': round(memo_org, 2),
            'top10Usd': round(top(10), 2), 'top100Usd': round(top(100), 2),
            'top10ShareOfReceipts': round(top(10) / receipts, 4) if receipts else None, 'top100ShareOfReceipts': round(top(100) / receipts, 4) if receipts else None,
            'top10ShareOfIndividualContributions': round(top(10) / indv, 4) if indv else None, 'top100ShareOfIndividualContributions': round(top(100) / indv, 4) if indv else None,
            'donorsAtLeast1M': len([d for d in ranked if d['cash'] >= 1e6]), 'donorsAtLeast1MUsd': round(sum(d['cash'] for d in ranked if d['cash'] >= 1e6), 2),
            'named': named, 'transactionTypes': dict(types), 'lastLine': last, 'replacedLines': swapped}


def america_lines():
    """America PAC's 2026 lines from the research note's receipts CSV as donor rows (cash from individuals, memo attributions, in-kind and small itemized from
    organisations), and None for the swap record."""
    path = os.path.join(RESEARCH, 'data/america-pac-c00879510-receipts-2025-2026-musk-and-in-kind-lines.csv')
    out = []
    for r in csv.DictReader(open(path, newline='')):
        memo = r['line_type'].startswith('memo attribution')
        org = r['line_type'].startswith('in-kind') or r['line_type'].startswith('other small')
        out.append({'name': r['contributor'], 'usd': float(r['amount_usd']), 'date': r['date'], 'filing': r['filing_id'], 'memo': memo, 'entity': 'ORG' if org else 'IND'})
    return out, None



def committee_totals(c, ie_by_cmte, party_coord):
    """Totals of super PACs, hybrid PACs, party committees and the two conduits for cycle c (webk<YY>), and what part of the spending a race can be
    named for. Schedule E: the committee summary's own independent-expenditure total (IND_EXP, same filings as the disbursements) and, beside it, the sum
    of the Schedule E file for the same committees (it carries 24- and 48-hour reports the summaries have not caught up with)."""
    rows = get_webk(c)
    out, dates = {}, collections.defaultdict(list)
    for g, label in GROUPS:
        out[g] = {'what': label, 'committees': 0, 'receiptsUsd': 0.0, 'disbursementsUsd': 0.0, 'individualContributionsUsd': 0.0, 'transfersInUsd': 0.0,
                  'transfersOutUsd': 0.0, 'contributionsToOtherCommitteesUsd': 0.0, 'refundsUsd': 0.0, 'loanRepaymentsUsd': 0.0,
                  'scheduleESummaryUsd': 0.0, 'scheduleEFileUsd': 0.0, 'partyCoordinatedUsd': 0.0}
    top = collections.defaultdict(list)
    for r in rows:
        g = group_of(r)
        if not g:
            continue
        o = out[g]
        o['committees'] += 1
        o['receiptsUsd'] += num(r['TTL_RECEIPTS']); o['disbursementsUsd'] += num(r['TTL_DISB']); o['individualContributionsUsd'] += num(r['INDV_CONTRIB'])
        o['transfersInUsd'] += num(r['TRANS_FROM_AFF']); o['transfersOutUsd'] += num(r['TRANF_TO_AFF']); o['contributionsToOtherCommitteesUsd'] += num(r['CONTRIB_TO_OTHER_CMTE'])
        o['refundsUsd'] += num(r['INDV_REFUNDS']) + num(r['OTHER_POL_CMTE_REFUNDS']); o['loanRepaymentsUsd'] += num(r['CAND_LOAN_REPAY']) + num(r['LOAN_REPAY'])
        o['scheduleESummaryUsd'] += num(r['IND_EXP'])
        o['scheduleEFileUsd'] += ie_by_cmte.get(r['CMTE_ID'], 0.0)
        if g == 'party':
            o['partyCoordinatedUsd'] += party_coord.get(r['CMTE_ID'], 0.0)
        d = iso_mdy(r['CVG_END_DT'])
        if d and d <= (datetime.date.today().isoformat() if c == 2026 else f'{c + 1}-03-31'):
            dates[g].append(d)
        top[g].append({'id': r['CMTE_ID'], 'name': r['CMTE_NM'], 'receiptsUsd': round(num(r['TTL_RECEIPTS']), 2), 'disbursementsUsd': round(num(r['TTL_DISB']), 2),
                       'scheduleESummaryUsd': round(num(r['IND_EXP']), 2), 'scheduleEFileUsd': round(ie_by_cmte.get(r['CMTE_ID'], 0.0), 2), 'coverageEnd': d})
    for g, o in out.items():
        for k in list(o):
            if k.endswith('Usd'):
                o[k] = round(o[k], 2)
        # What no race can be named for: disbursements less the Schedule E total (and, for parties, coordinated expenditures).
        o['allocatedToARaceUsd'] = round(o['scheduleESummaryUsd'] + o['partyCoordinatedUsd'], 2)
        o['notAllocatedToARaceUsd'] = round(o['disbursementsUsd'] - o['allocatedToARaceUsd'], 2)
        # Net of transfers, so a dollar passed from one committee to another is counted once (by the committee that spends it). Receipts less
        # transfers in from affiliated and other party committees (F3X line 12; webk TRANS_FROM_AFF). Disbursements less transfers out to affiliated
        # and other party committees (line 22; TRANF_TO_AFF) and contributions to federal candidates and other committees (line 23; CONTRIB_TO_OTHER_CMTE).
        o['netReceiptsUsd'] = round(o['receiptsUsd'] - o['transfersInUsd'], 2)
        o['netDisbursementsUsd'] = round(o['disbursementsUsd'] - o['transfersOutUsd'] - o['contributionsToOtherCommitteesUsd'], 2)
        o['netNotAllocatedToARaceUsd'] = round(o['netDisbursementsUsd'] - o['allocatedToARaceUsd'], 2)
        o['notAllocatedIfScheduleEFileUsd'] = round(o['disbursementsUsd'] - o['scheduleEFileUsd'] - o['partyCoordinatedUsd'], 2)
        o['coverageEndLatest'] = max(dates[g]) if dates[g] else ''
        o['top'] = sorted(top[g], key=lambda x: -x['disbursementsUsd'])[:8]
    tu = [r for r in rows if r['CMTE_TP'] == 'U']
    out['excluded'] = {'typeU': {'what': 'type U committees (single-candidate independent expenditure), not counted above', 'committees': len(tu),
                                  'receiptsUsd': round(sum(num(r['TTL_RECEIPTS']) for r in tu), 2)}}
    return out, [r for r in rows if r['CMTE_TP'] == 'O']



def pre_general(c):
    """The same committees at the same point in cycle c: what the filings on record by election day show through the pre-general report (PRE_GENERAL[c]).
    For each committee in the groups (webk types, as committee_totals), cycle to date = the last F3X of the year before (calendar year to date, covering
    through 31 December) + the last F3X of the election year covering through the cutoff (calendar year to date), the latest filing (highest filing
    number, so an amendment replaces what it amends) for each coverage end. Same fields as committee_totals' net figures."""
    rows = get_f3x(c)
    cutoff, y1end = PRE_GENERAL[c], f'{c - 1}-12-31'
    by = collections.defaultdict(list)
    for r in rows:
        if r['cmte'] and len(r['thru']) == 8:
            by[r['cmte']].append(r)
    def last(rs, lo, hi):
        rs = [r for r in rs if lo <= iso_ymd(r['thru']) <= hi]
        return max(rs, key=lambda r: (r['thru'], int(r['filing']))) if rs else None
    groups = {g: {k: 0.0 for k in ('receiptsUsd', 'disbursementsUsd', 'transfersInUsd', 'transfersOutUsd', 'contributionsToOtherCommitteesUsd', 'scheduleEUsd', 'partyCoordinatedUsd')} | {'committees': 0, 'withNoReport': 0} for g, _ in GROUPS}
    webk_rows = {r['CMTE_ID']: r for r in get_webk(c)}
    recon = {'committees': 0, 'matching': 0, 'ourUsd': 0.0, 'webkUsd': 0.0}
    for cid, w in webk_rows.items():
        g = group_of(w)
        if not g:
            continue
        rs = by.get(cid, [])
        a, b = last(rs, f'{c - 2}-01-01', y1end), last(rs, f'{c}-01-01', cutoff)
        o = groups[g]
        o['committees'] += 1
        if not (a or b):
            o['withNoReport'] += 1
            continue
        for k, f in (('receiptsUsd', 'receipts'), ('disbursementsUsd', 'disb'), ('transfersInUsd', 'tin'), ('transfersOutUsd', 'tout'), ('contributionsToOtherCommitteesUsd', 'cands'), ('scheduleEUsd', 'ie'), ('partyCoordinatedUsd', 'coord')):
            o[k] += sum(num(x['b_' + f]) for x in (a, b) if x)
        # Reconcile with the committee summary file: a committee whose last report on the summary ends by election day should match it to the dollar.
        if iso_mdy(w['CVG_END_DT']) and iso_mdy(w['CVG_END_DT']) <= ELECTION_DAY[c] and g != 'conduit':
            last_all = last(rs, f'{c}-01-01', ELECTION_DAY[c])
            ours = sum(num(x['b_disb']) for x in (last(rs, f'{c - 2}-01-01', y1end), last_all) if x)
            recon['committees'] += 1; recon['ourUsd'] += ours; recon['webkUsd'] += num(w['TTL_DISB'])
            recon['matching'] += abs(ours - num(w['TTL_DISB'])) < 1.0
    out = {}
    for g, o in groups.items():
        o = {k: round(v, 2) if isinstance(v, float) else v for k, v in o.items()}
        o['netReceiptsUsd'] = round(o['receiptsUsd'] - o['transfersInUsd'], 2)
        o['netDisbursementsUsd'] = round(o['disbursementsUsd'] - o['transfersOutUsd'] - o['contributionsToOtherCommitteesUsd'], 2)
        o['allocatedToARaceUsd'] = round(o['scheduleEUsd'] + o['partyCoordinatedUsd'], 2)
        o['notAllocatedToARaceUsd'] = round(o['disbursementsUsd'] - o['allocatedToARaceUsd'], 2)
        o['netNotAllocatedToARaceUsd'] = round(o['netDisbursementsUsd'] - o['allocatedToARaceUsd'], 2)
        out[g] = o
    last_day = max((r['day'] for r in rows), default='')
    out['through'] = cutoff
    out['filingsOnRecordBy'] = ELECTION_DAY[c] if last_day >= ELECTION_DAY[c] else last_day
    out['reconcile'] = {'what': 'committees whose last report on the committee summary file ends by election day: total disbursements from the F3X filings here against the summary file', 'committees': recon['committees'],
                        'matchingToTheDollar': recon['matching'], 'filingsUsd': round(recon['ourUsd'], 2), 'summaryFileUsd': round(recon['webkUsd'], 2)}
    return out

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


RESEARCH = os.path.expanduser('~/tcp-kb-internal/cascade-research/notes')
AMERICA_PAC = 'C00879510'


def america_pac(ie_2026):
    """America PAC, 2026 cycle: the committee summary, Schedule E, and the Musk and in-kind lines from the research note's receipts CSV
    (cascade-research/notes/vt-same-ballot-senate-vs-governor-gaps-2026-method-and-results.md, "America PAC"), whose July to October lines come
    straight from the Q3 and pre-general filings. Figures here are recomputed from that CSV, not typed."""
    tot = next(r for r in get_webk(2026) if r['CMTE_ID'] == AMERICA_PAC)
    csv_path = os.path.join(RESEARCH, 'data/america-pac-c00879510-receipts-2025-2026-musk-and-in-kind-lines.csv')
    SOURCES['america-pac-receipts'] = {'file': 'america-pac-c00879510-receipts-2025-2026-musk-and-in-kind-lines.csv (cascade-research/notes/data)',
        'note': 'Research note vt-same-ballot-senate-vs-governor-gaps-2026-method-and-results: FEC API schedule_a through 2026-06-30, then filings 2026216 (Q3) and 2038959 (pre-general) read directly'}
    rows = list(csv.DictReader(open(csv_path, newline='')))
    cash = [r for r in rows if r['contributor'] == 'MUSK, ELON' and r['line_type'] == 'cash from individual']
    memo = [r for r in rows if r['line_type'].startswith('memo attribution')]
    inkind = [r for r in rows if r['line_type'].startswith('in-kind receipt')]
    sm = lambda L: round(sum(float(r['amount_usd']) for r in L), 2)
    biggest = sorted(cash, key=lambda r: -float(r['amount_usd']))[:5]
    receipts = num(tot['TTL_RECEIPTS'])
    return {'committee': AMERICA_PAC, 'name': tot['CMTE_NM'], 'type': tot['CMTE_TP'], 'cycle': 2026,
            'summary': {'receiptsUsd': receipts, 'disbursementsUsd': num(tot['TTL_DISB']), 'scheduleESummaryUsd': num(tot['IND_EXP']), 'coverageEnd': iso_mdy(tot['CVG_END_DT']),
                        'src': 'webk26', 'note': 'committee summary file; the FEC API committee totals for the same cycle give $215,977,673.63 through 2026-10-14 (research note c4)'},
            'scheduleEFileUsd': round(ie_2026.get(AMERICA_PAC, 0.0), 2), 'scheduleEFileSrc': 'ie2026',
            'scheduleENote': 'The summary line and the Schedule E file measure different things: the file carries 24- and 48-hour reports the committee\'s periodic summary has not caught up with. The research note found $51.4M (committee totals) and $71.4M (Schedule E file as of 2026-10-26).',
            'notAllocatedToARaceUsd': round(num(tot['TTL_DISB']) - num(tot['IND_EXP']), 2), 'notAllocatedIfScheduleEFileUsd': round(num(tot['TTL_DISB']) - ie_2026.get(AMERICA_PAC, 0.0), 2),
            'notAllocatedNote': 'Canvassing, petitions and operations are reported as operating expenditures, not Schedule E, so they are in this part.',
            'musk': {'cashUsd': sm(cash), 'cashLines': len(cash), 'cashShareOfReceipts': round(sm(cash) / receipts, 4), 'cashFirst': min(r['date'] for r in cash), 'cashLast': max(r['date'] for r in cash),
                     'inKindFromUnitedStatesOfAmericaIncUsd': sm(inkind), 'memoAttributionToMuskUsd': sm(memo), 'memoNote': 'each in-kind line booked to United States of America Inc is followed by a Musk memo line marked as an attribution; memo lines are not additive',
                     'cashPlusAttributedUsd': round(sm(cash) + sm(memo), 2), 'cashPlusAttributedShareOfReceipts': round((sm(cash) + sm(memo)) / receipts, 4),
                     'largestCashLines': [{'usd': float(r['amount_usd']), 'date': r['date'], 'filing': r['filing_id'], 'source': r['source']} for r in biggest],
                     'filings': sorted({r['filing_id'] for r in rows}), 'src': 'america-pac-receipts'}}



def sides_of(c, cs, v, cand_ie):
    """The two candidates named in the vote record (Democratic side, Republican side) matched to FEC candidates in the state: by surname inside the
    vote record's name (so an independent counted on the Democratic side, such as Angus King, is found), else by FEC party code, the one with the most
    receipts. Each side carries that candidate's own spending and the outside money naming them: ieFor supporting, ieAgainst opposing, coord party
    coordinated. Outside money that names no candidate id is in the race totals only."""
    def find(name, pty):
        up = re.sub(r'[^A-Z ]', ' ', name.upper())
        hit = [x for x in cs if re.search(r'\b' + re.escape(re.sub(r'[^A-Z ]', ' ', x['name'].split(',')[0].strip().upper()).strip()) + r'\b', up)]
        how = 'name'
        if not hit:
            hit = [x for x in cs if x['party'] == pty]; how = 'party'
        return (max(hit, key=lambda x: x['receipts']), how) if hit else (None, None)
    d, dh = find(v[2], 'DEM')
    r_, rh = find(v[3], 'REP')
    if not d or not r_ or d['id'] == r_['id']:
        return None
    side = lambda x, how: {'id': x['id'], 'name': x['name'], 'party': x['party'], 'matched': how, 'spentUsd': round(x['disb'], 2), 'coordUsd': round(cand_ie[(c, x['id'])]['C'], 2),
                           'ieForUsd': round(cand_ie[(c, x['id'])]['S'], 2), 'ieAgainstUsd': round(cand_ie[(c, x['id'])]['O'], 2)}
    return {'D': side(d, dh), 'R': side(r_, rh)}



def main():
    if '--f3x-only' in args:
        for c in (2022, 2024, 2026):
            print(c, len(get_f3x(c)), 'F3X rows')
        return
    sen_votes, pres_votes, vote_checks = load_votes()
    out = {'method': (__doc__ or '').strip().split('\n\n')[0], 'cycles': CYCLES, 'senate': [], 'president': [], 'checks': {}, 'unmapped': {}}
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
    ie_cm = collections.defaultdict(lambda: collections.defaultdict(float))     # cycle -> committee -> Schedule E dollars (all offices)
    pc_cm = collections.defaultdict(lambda: collections.defaultdict(float))     # cycle -> committee -> party coordinated (24C)
    ie_last = {}
    cand_ie = collections.defaultdict(lambda: collections.defaultdict(float))   # (cycle, candidate id) -> S support, O oppose, C party coordinated
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
            for so, cid, off, st, _dis, _et, usd, nm, spe, ied in rows:
                ie_cm[c][spe] += usd
                try:
                    dd = datetime.datetime.strptime(ied, '%d-%b-%y').date().isoformat()
                    if dd <= (datetime.date.today().isoformat() if c == 2026 else f'{c + 1}-03-31') and dd > ie_last.get(c, ''):
                        ie_last[c] = dd
                except ValueError:
                    pass
                o, s = race_of(cid, off, st, nm)
                if o is not None and cid in cands:
                    cand_ie[(c, cid)]['S' if so == 'S' else 'O'] += usd
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
        for tp, cid, usd, cmte in pas2_rows(c):
            x = cands.get(cid)
            if tp == '24C':
                pc_cm[c][cmte] += usd
            elif c < 2010:
                ie_cm[c][cmte] += usd
            if x:
                cand_ie[(c, cid)]['C' if tp == '24C' else 'S' if tp == '24E' else 'O'] += usd if (tp == '24C' or c < 2010) else 0
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
                    race['sides'] = sides_of(c, cs, v, cand_ie)
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
    # Outside money as committee totals, donor concentration, America PAC (2008-2026)
    out['committees'] = {'note': ('Totals of the committees that spend outside the candidates, per two-year cycle, from the FEC PAC and party summary files (webk). '
                                  'Each group shows what a race can be named for (Schedule E, and for parties coordinated expenditures: "allocatedToARace") and what it cannot '
                                  '("notAllocatedToARace": disbursements less that). Receipts and disbursements include transfers between committees, so a dollar passed '
                                  'from one committee to another is counted by both; the transfer fields show how much.'),
                         'groups': {g: l for g, l in GROUPS}, 'cycles': {}}
    out['donors'] = {'note': ('Itemized contributions from individuals to super PACs (type O), from the FEC indiv files (Schedule A line 11A), per cycle. Donors are keyed by '
                              'name and state (the FEC has no donor id). Memo lines (an attribution of money received through another entity, such as an in-kind gift booked '
                              'to a company) are totalled apart and not added to the donor\'s cash. Only donors of $1 million or more are named.'), 'cycles': {}}
    coverage = {}
    for c in CYCLES:
        tot, sp = committee_totals(c, ie_cm[c], pc_cm[c])
        if c in ELECTION_DAY:
            tot['preGeneral'] = pre_general(c)
        out['committees']['cycles'][str(c)] = tot
        ds = donor_stats(c, sp) if c >= 2010 else None
        if ds:
            out['donors']['cycles'][str(c)] = ds
        cap = datetime.date.today().isoformat() if c == 2026 else f'{c + 1}-03-31'       # a few filings carry typo dates years out; a finished cycle's files run to its post-general reports
        coverage[str(c)] = {'partial': c == 2026, 'committeeSummariesThrough': max(tot[g]['coverageEndLatest'] for g in ('superPac', 'hybrid', 'party')),
                            'itemizedLinesThrough': ds['lastLine'] if ds else '', 'scheduleEFileThrough': ie_last.get(c, ''),
                            'candidateSummariesThrough': max((iso_mdy(x['cvg']) for x in cand_by_cycle[c].values() if iso_mdy(x['cvg']) and iso_mdy(x['cvg']) <= cap), default='')}
    out['coverage'] = coverage
    out['americaPac'] = america_pac(ie_cm[2026])
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
