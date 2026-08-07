import json, os, re, glob

TR = "/root/.claude/projects/-home-user-p95/2115e4a0-157a-542a-80e3-491050aef5f5/tool-results"
man = {}
for line in open("build/manifest.tsv"):
    p = line.rstrip("\n").split("\t")
    if len(p)==4: man[p[0]] = {"id":p[0],"date":p[1],"type":p[2],"title":p[3]}

def clean(t):
    # collapse "( https://... )" link artifacts entirely
    t = re.sub(r'\(\s*https?://[^\s)]+\s*\)', '', t)
    t = re.sub(r'https?://\S+', '', t)
    # strip the header/footer boilerplate
    t = t.replace("View in browser", "").replace("Listen in your podcast player","")
    # cut everything from Subscription Information onward
    i = t.find("Subscription Information")
    if i > 0: t = t[:i]
    # remove the asterisk banner lines
    t = re.sub(r'^\*{3,}$', '', t, flags=re.M)
    # normalize whitespace
    t = re.sub(r'[ \t]+', ' ', t)
    t = re.sub(r'\n{3,}', '\n\n', t)
    lines = [l.strip() for l in t.split("\n")]
    out=[]
    for l in lines:
        if l in ("","|"): out.append("")
        elif re.fullmatch(r'[-=]{3,}', l): continue
        else: out.append(l)
    t = "\n".join(out)
    t = re.sub(r'\n{3,}', '\n\n', t).strip()
    return t

found = {}
for f in glob.glob(os.path.join(TR, "mcp-Gmail-get_thread-*.txt")):
    try: d = json.load(open(f))
    except Exception: continue
    if not isinstance(d, dict) or "messages" not in d: continue
    for m in d["messages"]:
        tid = d.get("id") or m.get("id")
        body = m.get("plaintextBody","")
        if not body: continue
        rec = man.get(tid, {"id":tid,"date":m.get("date","")[:10],"type":"unknown","title":m.get("subject","")})
        rec = dict(rec)
        rec["subject"] = m.get("subject","")
        rec["dek"] = (m.get("snippet","") or "")[:300]
        rec["text"] = clean(body)
        rec["words"] = len(rec["text"].split())
        if rec["words"] < 150: continue
        prev = found.get(tid)
        if prev is None or rec["words"] > prev["words"]:
            found[tid] = rec

corpus = sorted(found.values(), key=lambda r: r["date"])
json.dump(corpus, open("build/corpus.json","w"), indent=1)
os.makedirs("corpus", exist_ok=True)
for r in corpus:
    with open(f"corpus/{r['date']}_{r['id']}.txt","w") as fh:
        fh.write(f"# {r['title']}\n# type={r['type']} date={r['date']}\n\n{r['text']}")

from collections import Counter
print("pieces:", len(corpus))
print("total words:", sum(r["words"] for r in corpus))
print(Counter(r["type"] for r in corpus))
print("date range:", corpus[0]["date"], "->", corpus[-1]["date"])
missing = [k for k,v in man.items() if k not in found and v["type"]!="weekly"]
print("missing non-weekly:", len(missing))
for m in missing[:20]: print("  MISS", man[m]["date"], man[m]["type"], man[m]["title"][:60])
