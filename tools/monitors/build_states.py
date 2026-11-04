import json,re,os,html
B=os.path.expanduser("~/TransparencyCascade/static/monitors")
s=open(f"{B}/index.html").read(); D=json.load(open(f"{B}/data.json"))
slug=lambda x: re.sub(r"[^a-z]+","-",x.lower())
for st in sorted({r["st"] for r in D["rows"]}):
    rs=[r for r in D["rows"] if r["st"]==st]; dr=[d for d in D["dropped"] if d["st"]==st]
    n=len(rs); new=sum(1 for r in rs if not r["y22"] and not r["y24"])
    places=", ".join(r["j"] for r in rs)
    t=s
    t=re.sub(r"<title>.*?</title>",f"<title>DOJ Election Monitors in {html.escape(st)}</title>",t,count=1)
    desc=f"The Justice Department said it intends to monitor or observe voting in {n} place{'s' if n!=1 else ''} in {st} on Nov. 3, 2026: {places}."
    t=re.sub(r'<meta name="description" content=".*?">',f'<meta name="description" content="{html.escape(desc)}">',t,count=1)
    t=t.replace("<h1>Watching the watchers</h1>",f"<h1>Watching the watchers in {html.escape(st)}</h1>",1)
    dek_old=re.search(r'<p class="dek">.*?</p>',t,re.S).group(0)
    extra=(f" DOJ also monitored {', '.join(d['j'] for d in dr)} in 2024; {'it is' if len(dr)==1 else 'they are'} not on this year's list." if dr else "")
    dek=(f'<p class="dek">On Election Day morning the Justice Department said it intends to "monitor or observe" voting in {n} place{"s" if n!=1 else ""} in {html.escape(st)}: '
         f'{html.escape(places)}. {("None is" if new==0 else (str(new)+" is") if new==1 else (str(new)+" are"))} new this year.{html.escape(extra)} <a href="https://www.justice.gov/opa/pr/doj-monitor-elections-all-50-states-first-time">DOJ\'s release</a>.</p>')
    t=t.replace(dek_old,dek,1)
    t=t.replace("<script>\n(async function(){",f"<script>window.MON_STATE={json.dumps(st)}; window.MON_BASE='../';</script>\n<script>\n(async function(){{".replace("{{","{"),1)
    sl=slug(st)
    t=t.replace('<meta property="og:title" content="Watching the watchers, watching the count">', f'<meta property="og:title" content="{html.escape(st)}: watching the watchers, watching the count">')
    t=re.sub(r'<meta property="og:description" content=".*?">', f'<meta property="og:description" content="{html.escape(desc)}">', t, count=1)
    t=t.replace('content="https://transparencycascade.org/monitors/"', f'content="https://transparencycascade.org/monitors/{sl}/"')
    t=t.replace('cards/watching.png', f'cards/{sl}.png')
    os.makedirs(f"{B}/{slug(st)}",exist_ok=True); open(f"{B}/{slug(st)}/index.html","w").write(t)
# the count page: same file, count sections shown (body data-page="count"); ?state=X zooms it to one state
c=s
c=re.sub(r"<title>.*?</title>","<title>Watching the Count: Calls, Canvasses and Certification, 2026</title>",c,count=1)
c=re.sub(r'<meta name="description" content=".*?">','<meta name="description" content="Race calls as outlets reported them, the certification calendar and reports on the count after Election Day 2026.">',c,count=1)
c=c.replace('<meta property="og:title" content="Watching the watchers, watching the count">','<meta property="og:title" content="Watching the count">')
c=c.replace('content="https://transparencycascade.org/monitors/"','content="https://transparencycascade.org/monitors/count/"')
c=c.replace("<body>",'<body data-page="count">',1)
hd=re.search(r"  <h1>Watching the watchers</h1>\n  <p class=\"dek\">.*?</p>",c,re.S).group(0)
c=c.replace(hd,'  <h1 id="count-title">Watching the count</h1>\n  <p class="dek">After the polls close, the fight moves to the count: race calls, canvasses, rescans, certification deadlines and lawsuits. We follow it through certification. Where DOJ sent monitors on Election Day is on <a href="/monitors/">Watching the watchers</a>.</p>',1)
c=c.replace("<script>\n(async function(){","<script>window.MON_PAGE='count'; window.MON_BASE='../'; (function(){var s=new URLSearchParams(location.search).get('state'); if(s){window.MON_STATE=s; document.title='Watching the count in '+s; var h=document.getElementById('count-title'); if(h) h.textContent='Watching the count in '+s;}})();</script>\n<script>\n(async function(){",1)
os.makedirs(f"{B}/count",exist_ok=True); open(f"{B}/count/index.html","w").write(c)
print("built")
