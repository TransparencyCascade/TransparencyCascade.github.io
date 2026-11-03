import json,re
J=json.load(open("joined.json"))
def norm(s):
    s=s.lower().replace("’","'")
    s=re.sub(r"^(city|town) of ","",s); s=re.sub(r"\(.*?\)","",s)
    s=re.sub(r" (county|census area|city-borough|borough|parish|municipality)$","",s.strip())
    s=s.replace("macon-bibb","bibb").replace("miami-dade","miami dade").replace("e. lansing","east lansing").replace("prince george's","prince georges").replace("laramie county","laramie")
    return s.strip()
def parse(f):
    out=set()
    for l in open(f):
        l=l.strip().rstrip(";").rstrip(",").replace("; and","").replace(" and","")
        m=re.match(r"(.+),\s*([A-Z][a-zA-Z ]+)$",l)
        if m and len(l)<70: out.add((m.group(2).strip(),norm(m.group(1))))
    return out
y22=parse("24.txt"); y24=parse("27.txt")
y26={(o["state"],norm(o["listed"])) for o in J}
print("parsed 2022",len(y22),"2024",len(y24),"2026",len(y26))
new=y26-y24-y22; kept=y26&(y24|y22); dropped24=y24-y26
print("2026 entries also on 2022 or 2024 list:",len(kept)); print("new in 2026:",len(new)); print("on 2024 list, not 2026:",len(dropped24))
print("DROPPED from 2024:",sorted(dropped24))
J2={(o["state"],norm(o["listed"])):o for o in J}
def prof(keys,label):
    os=[J2[k] for k in keys if k in J2]
    v=[o for o in os if o["dem24"] is not None]
    hw=sum(1 for o in v if o["dem24"]>o["gop24"])
    mm=sum(1 for o in os if o["pct_nhwhite"]<50)
    print(f"{label}: n={len(os)} Harris-won {hw}/{len(v)}; majority-minority {mm}/{len(os)}")
    return os
newo=prof(new,"NEW 2026"); keepo=prof(kept,"CARRIED OVER")
print("NEW list:",sorted((o["state"],o["listed"],o["dem24"],o["pct_nhwhite"]) for o in newo))
json.dump({"new":sorted(new),"kept":sorted(kept),"dropped24":sorted(dropped24)},open("compare.json","w"),indent=1)
