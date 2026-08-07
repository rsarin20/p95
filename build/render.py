import json
d=json.load(open("build/data.json"))
for c in d["concepts"]:
    for k in ("theses","quotes"):
        for q in c[k]:
            if len(q["t"])>760: q["t"]=q["t"][:760].rsplit(" ",1)[0]+"…"
raw=json.dumps(d,separators=(",",":"),ensure_ascii=False).replace("</","<\\/")
open("stratechery-stack.html","w").write(open("build/template.html").read().replace("__DATA__",raw))
