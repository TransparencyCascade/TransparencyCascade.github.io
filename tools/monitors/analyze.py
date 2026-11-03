import csv, collections, json, re
C="inputs/doj-nov-3-2026-election-monitor-jurisdictions.csv"  # run from tools/monitors
rows=list(csv.DictReader(open(C)))
cc=[x for x in csv.DictReader(open("cc.csv",encoding="latin-1")) if x["YEAR"]=="6" and x["AGEGRP"]=="0"]
def i(x,k): return int(x[k+"_MALE"])+int(x[k+"_FEMALE"])
county={}
for x in cc:
    f=x["STATE"]+x["COUNTY"]
    county[f]=dict(state=x["STNAME"],name=x["CTYNAME"],pop=int(x["TOT_POP"]),nhw=i(x,"NHWA"),blk=i(x,"BAC"),his=i(x,"H"),aian=i(x,"IAC"),asn=i(x,"AAC"))
pres={x["county_fips"].zfill(5):x for x in csv.DictReader(open("pres24.csv"))}
# city -> county name overrides
city={("Michigan","Lansing"):"Ingham",("Michigan","E. Lansing"):"Ingham",("Michigan","Grand Rapids"):"Kent",("Michigan","Flint"):"Genesee",
("Michigan","Detroit"):"Wayne",("Michigan","Hamtramck"):"Wayne",("Michigan","Warren"):"Macomb",("Michigan","Dearborn"):"Wayne",
("Illinois","Chicago"):"Cook",("Virginia","Charlottesville"):"Charlottesville city",("Virginia","Virginia Beach"):"Virginia Beach city",
("Alaska","Anchorage"):"Anchorage Municipality",("Alaska","Dillingham"):"Dillingham Census Area",("Alaska","Kusilvak"):"Kusilvak Census Area",
("Maine","Lewiston"):"Androscoggin",("Maine","Portland"):"Cumberland",("Maine","South Portland"):"Cumberland",("Minnesota","Minneapolis"):"Hennepin",
("Missouri","St. Louis"):"St. Louis city",("Massachusetts","Lowell"):"Middlesex",("Massachusetts","Boston"):"Suffolk",
("New Hampshire","Manchester"):"Hillsborough",("New Hampshire","Nashua"):"Hillsborough",("Wisconsin","Madison"):"Dane",("Wisconsin","Milwaukee"):"Milwaukee",
("Connecticut","New Haven"):"South Central Connecticut Planning Region",("Rhode Island","Pawtucket"):"Providence",("Vermont","Burlington"):"Chittenden",
("Florida","Miami Dade"):"Miami-Dade",("Maryland","Prince Georges"):"Prince George's",("Wyoming","Laramie County"):"Laramie",("New York","New York"):"New York",
("Louisiana","Orleans"):"Orleans Parish",("Louisiana","East Baton Rouge"):"East Baton Rouge Parish",("Louisiana","Lafayette"):"Lafayette Parish"}
CITIES={k for k in city if not k[1] in ("Chicago",) } 
def find(st,nm):
    key=city.get((st,nm),nm)
    cands=[(f,c) for f,c in county.items() if c["state"]==st and (c["name"]==key or c["name"]==key+" County" or c["name"]==key+" Parish")]
    if len(cands)!=1:
        cands=[(f,c) for f,c in cands if "city" not in c["name"]] or cands
    return cands[0] if cands else (None,None)
out=[]
for r in rows:
    f,c=find(r["state"],r["jurisdiction_as_listed"])
    kind="city" if (r["state"],r["jurisdiction_as_listed"]) in city and "County" not in city[(r["state"],r["jurisdiction_as_listed"])] and not city[(r["state"],r["jurisdiction_as_listed"])].endswith(("city","Area","Municipality","Parish","Region")) else "county"
    if (r["state"],r["jurisdiction_as_listed"]) in [("Virginia","Charlottesville"),("Virginia","Virginia Beach"),("Missouri","St. Louis")]: kind="independent city"
    p=pres.get(f) if f else None
    out.append(dict(state=r["state"],listed=r["jurisdiction_as_listed"],kind=kind,fips=f,county=c["name"] if c else None,
        pop=c["pop"] if c else None,
        pct_nhwhite=round(100*c["nhw"]/c["pop"],1) if c else None,pct_black=round(100*c["blk"]/c["pop"],1) if c else None,
        pct_hisp=round(100*c["his"]/c["pop"],1) if c else None,pct_aian=round(100*c["aian"]/c["pop"],1) if c else None,pct_asian=round(100*c["asn"]/c["pop"],1) if c else None,
        dem24=round(100*float(p["per_dem"]),1) if p else None,gop24=round(100*float(p["per_gop"]),1) if p else None))
missing=[o for o in out if not o["fips"]]
print("unmatched:",[(o["state"],o["listed"]) for o in missing])
# Section 203
s=list(csv.DictReader(open("s203/sect203_Determined_Areas_Only.csv",encoding="latin-1")))
cov=collections.defaultdict(set)
for x in s:
    if x["FLAG_COV"]!="1" or x["LANGUAGE"]=="Total Population": continue
    if x["SUMLVL"]=="040": cov["state:"+x["ST"]].add(x["LANGUAGE"])
    if x["SUMLVL"]=="050": cov[x["ST"]+x["CNTY"]].add(x["LANGUAGE"])
    if x["SUMLVL"]=="060": cov["mcd:"+x["ST"]+":"+x["NAMELSAD"].lower()].add(x["LANGUAGE"])
for o in out:
    langs=set()
    if o["fips"]:
        langs|=cov.get(o["fips"],set())|cov.get("state:"+o["fips"][:2],set())
        for k,v in cov.items():
            if k.startswith("mcd:"+o["fips"][:2]+":") and o["listed"].lower().replace("e. ","east ") in k: langs|=v
    o["s203_languages"]="; ".join(sorted(langs))
json.dump(out,open("joined.json","w"),indent=1)
with open("/Users/markr/tcp-kb-internal/cascade-research/datasets/doj-nov-3-2026-monitor-jurisdictions-enriched.csv","w",newline="") as fh:
    w=csv.DictWriter(fh,fieldnames=list(out[0].keys())); w.writeheader(); w.writerows(out)
# national baselines
T=sum(c["pop"] for c in county.values())
nat=dict(nhw=sum(c["nhw"] for c in county.values())/T,blk=sum(c["blk"] for c in county.values())/T,his=sum(c["his"] for c in county.values())/T,aian=sum(c["aian"] for c in county.values())/T,asn=sum(c["asn"] for c in county.values())/T)
uniq={o["fips"]:county[o["fips"]] for o in out if o["fips"]}
P=sum(c["pop"] for c in uniq.values())
print("unique counties",len(uniq),"pop",P,"share of US",round(100*P/T,1))
for k in ("nhw","blk","his","aian","asn"):
    print(k,"listed",round(100*sum(c[k] for c in uniq.values())/P,1),"US",round(100*nat[k],1))
# vote
dv=gv=tv=0
for f in uniq:
    p=pres.get(f)
    if p: dv+=int(p["votes_dem"]); gv+=int(p["votes_gop"]); tv+=int(p["total_votes"])
print("2024 in listed counties: dem",round(100*dv/tv,1),"gop",round(100*gv/tv,1),"(US popular 48.3/49.8)")
won=[o for o in out if o["dem24"] is not None]
print("jurisdictions Harris won:",sum(1 for o in won if o["dem24"]>o["gop24"]),"of",len(won))
print("Trump-won:",[(o["state"],o["listed"],o["gop24"]) for o in won if o["gop24"]>o["dem24"]])
print("S203 covered:",[(o["state"],o["listed"],o["s203_languages"]) for o in out if o["s203_languages"]])
print("majority-minority:",sum(1 for o in out if o["pct_nhwhite"] is not None and o["pct_nhwhite"]<50),"of",len(out))
