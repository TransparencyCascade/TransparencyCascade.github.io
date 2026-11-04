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
    t=t.replace("<h1>Watching the watchers, watching the count</h1>",f"<h1>{html.escape(st)}: watching the watchers, watching the count</h1>",1)
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
print("built")
