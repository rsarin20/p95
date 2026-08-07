import json, re
from collections import Counter, defaultdict
C = json.load(open("build/corpus.json"))
BEN = len([x for x in C if x["type"]!="interview"])

# ---------- thesis line per piece (guaranteed Ben's own one-line summary) ----------
for r in C:
    first = r["text"].split("\n")[0].strip()
    # thesis is the dek line; fall back to snippet
    if len(first) < 40 or len(first) > 400:
        first = re.split(r'(?<=[.?!])\s', r["dek"].strip())[0]
    r["thesis"] = " ".join(first.split())

# ---------- CLUSTERS (8): 6-layer causal stack + 2 envelopes ----------
CLUSTERS = [
 dict(id="agentic", n=1, kind="stack", name="The Agentic Turn",
   sub="The shock that reset everything",
   blurb="Agents stopped being a demo and started being useful. Every other argument in the corpus is downstream of this.",
   terms={"agents":r"\bagent(?:s|ic)?\b","agentic inference":r"agentic inference","the harness":r"\bharness\b|scaffold",
          "tokens":r"\btokens?\b(?! ?(?:of|ring))|token (?:cost|price|speed|generation|consum)|per(?:-| )token","vibe coding":r"vibe cod","coding as the wedge":r"Claude Code|Codex|Copilot"}),
 dict(id="demand", n=2, kind="stack", name="The Shape of Demand",
   sub="Inference stopped looking like inference",
   blurb="Agents don't consume compute the way chatbots do. Training gave way to inference; speed gave way to memory.",
   terms={"the inference shift":r"\binference\b","training vs inference":r"\btraining\b",
          "memory hierarchy":r"memory (?:hierarch|bandwidth)|KV cache|\bHBM\b|memory chip",
          "marginal cost":r"marginal cost","opportunity cost of compute":r"opportunity cost"}),
 dict(id="floor", n=3, kind="stack", name="The Physical Floor",
   sub="Atoms became the binding constraint",
   blurb="Once compute is scarce, strategy is decided by fabs, power, memory and land — the things you cannot conjure.",
   terms={"capex":r"\bcapex\b|capital expenditure","power as the limit":r"electricity|gigawatts?|megawatts?|power (?:constrain|generation|is the|limit|availab|plant|densit)|power(?:ed)? by (?:gas|nuclear|solar)|the (?:power )?grid|turbine",
          "the TSMC brake":r"TSMC brake|TSMC(?:\'s)? (?:willingness|caution|conservat|invest|capex|discipline)|foundry (?:capacity|competition)","fabs & foundry":r"\bfoundry|\bfab(?:s)?\b|lithograph",
          "data centers & land":r"data cent(?:er|re)","compute in orbit":r"data cent(?:er|re)s? in space|in orbit|orbital|satellite constellation|Starlink|space-based"}),
 dict(id="chokepoint", n=4, kind="stack", name="The Chokepoint",
   sub="Who owns the point of integration",
   blurb="Scarcity relocates power. Ben's oldest question — who controls demand — gets re-litigated against a supply-constrained world.",
   terms={"point of integration":r"point of integration|integrat","Aggregation Theory":r"aggregat",
          "commoditization":r"commoditiz","demand vs. supply":r"owning demand|control(?:ling)? demand|owning supply",
          "modularity":r"modular","the full stack":r"(?:the )?(?:full|whole|entire) stack|vertically integrat|top to bottom"}),
 dict(id="meter", n=5, kind="stack", name="The Meter",
   sub="Turning compute into revenue",
   blurb="Compute costs money every time it runs. That forces a reckoning with business models built for zero marginal cost.",
   terms={"advertising":r"\badvertis","subscriptions":r"subscription (?:business|model|revenue|price|service|bundle)|subscribers?\b|paid subscription","bundling":r"\bbundl",
          "per-user to per-usage":r"per(?:-| )user|per(?:-| )usage|consumption","enterprise":r"enterprise (?:customer|business|market|sales|adoption|software|agent|deal|revenue|push|strategy)|the enterprise\b",
          "SaaS under pressure":r"\bSaaS\b|software.as.a.service"}),
 dict(id="reckoning", n=6, kind="stack", name="The Reckoning",
   sub="Incumbents meet the paradigm",
   blurb="Every incumbent gets graded on one question: does the new paradigm move the point where value is captured away from you?",
   terms={"paradigm shift":r"paradigm","the winner's curse":r"winner'?s curse|previous winners|hardest time adjust|rooted in the existing paradigm|\bpride\b|humble about",
          "disruption":r"disrupt(?:ion|ive|ed|ing)\b|low(?:-| )end|Christensen|new market","software survival":r"usurp|survival",
          "integration moves":r"thin client|thick client|hardware differentiat","the moat erodes":r"\bmoat\b|mainframe"}),
 dict(id="borders", n=7, kind="envelope", name="Borders & Rules",
   sub="The envelope the market runs inside",
   blurb="Nothing in the stack is decided purely by markets. Export controls, Beijing, Brussels and Washington set the walls.",
   terms={"China & open weights":r"Chinese (?:model|lab|memory|chip|compan|competit)|open(?:-| )(?:weight|source) model|Kimi|DeepSeek|Qwen|models out of China","export controls":r"export control|chip control",
          "Taiwan risk":r"Taiwan (?:Strait|invasion|risk|contingency)|\bTaiwan\b","rare earths":r"rare earth","alignment & safety":r"\balign|\bsafety\b|jailbreak",
          "government as customer":r"Department of War|government (?:customer|contract|as a customer|procurement)|the administration|Washington|national security","regulation":r"regulat(?:ion|ory|ors?|e|ing)\b|antitrust|\bDMA\b|Digital Markets Act|European Commission|remedies"}),
 dict(id="stakes", n=8, kind="envelope", name="Attention & the Human Stakes",
   sub="What it is all finally for",
   blurb="The arena where AI meets people: what gets made, who makes it, who watches, and what work is left.",
   terms={"attention":r"\battention\b(?! to detail)","creators & gatekeepers":r"\bcreator|gatekeep",
          "IP & franchise":r"\bIP\b|franchise|content library|rights holder|catalog","content & community":r"communit",
          "jobs & the human condition":r"human condition|white(?:-| )collar|job (?:market|losses|displacement|prospects for)|replace (?:all of the )?(?:jobs|humans|workers)|unemploy|labor market|meaning(?:ful)? work","the interface":r"form factor|user interface|glasses|wearable"}),
]

# ---------- score concepts against corpus ----------
NOISE = re.compile(r"^\s*\*?[A-Z]{2}:|^\s*\*[A-Z][a-z]+ [A-Z]")   # transcript speaker tags
def ok_para(p):
    if NOISE.match(p): return False
    if p.count("?")>3: return False
    return True

def paras(r):
    for p in r["text"].split("\n\n")[1:]:
        p=" ".join(p.split())
        if 200 < len(p) < 1100 and ok_para(p): yield p

DEFSIG = re.compile(r"\b(is that|means|the reason|which is why|in other words|the point|the key|fundamentally|the implication|what matters|the question|because|precisely)\b", re.I)

concepts=[]; c_docs={}
for cl in CLUSTERS:
    for cname, pat in cl["terms"].items():
        rx=re.compile(pat, re.I)
        docs=[]; hits=0; cand=[]
        for r in [x for x in C if x["type"]!="interview"]:
            n=len(rx.findall(r["text"]))
            if n:
                hits+=n; docs.append(r["id"])
                if r["type"]=="interview": continue
                for p in paras(r):
                    k=len(rx.findall(p))
                    if not k: continue
                    s=k*3+len(DEFSIG.findall(p))*2+(4 if r["type"]=="article" else 0)
                    cand.append((s,r))
        # thesis-line quotes (guaranteed Ben's voice, one sentence)
        thes=[(len(rx.findall(r["thesis"]))*4+(3 if r["type"]=="article" else 0), r)
              for r in C if rx.search(r["thesis"]) and r["type"]!="interview"]
        thes.sort(key=lambda x:-x[0])
        seen=set(); tq=[]
        for s,r in thes:
            if r["id"] in seen: continue
            seen.add(r["id"]); tq.append(dict(t=r["thesis"], d=r["date"], p=r["title"], ty=r["type"]))
            if len(tq)>=3: break
        cand.sort(key=lambda x:-x[0]); seen=set(); bq=[]
        for s,r in cand:
            if r["id"] in seen: continue
            seen.add(r["id"])
            rx2=re.compile(pat,re.I)
            best=max((( len(rx2.findall(p))*3+len(DEFSIG.findall(p))*2, p) for p in paras(r)), default=(0,None))
            if best[1]: bq.append(dict(t=best[1], d=r["date"], p=r["title"], ty=r["type"]))
            if len(bq)>=3: break
        c_docs[cname]=set(docs)
        concepts.append(dict(id=re.sub(r'[^a-z0-9]+','-',cname.lower()).strip('-'), name=cname, cluster=cl["id"],
                             docs=len(docs), hits=hits, share=round(100*len(docs)/BEN),
                             theses=tq, quotes=bq))

# ---------- co-occurrence links between concepts ----------
names=[c["name"] for c in concepts]
for c in concepts:
    a=c_docs[c["name"]]; sims=[]
    for o in concepts:
        if o["name"]==c["name"]: continue
        b=c_docs[o["name"]]
        j=len(a&b)/max(1,len(a|b))
        if j>0.12: sims.append((round(j,3), o["id"], o["name"], o["cluster"]))
    sims.sort(reverse=True)
    c["links"]=[dict(id=i,name=n,cluster=cc,w=j) for j,i,n,cc in sims[:6]]

json.dump(dict(
  clusters=[{k:v for k,v in cl.items() if k!="terms"} for cl in CLUSTERS],
  concepts=concepts,
  pieces=[dict(id=r["id"],d=r["date"],ty=r["type"],t=r["title"],th=r["thesis"],w=r["words"]) for r in C],
  stats=dict(pieces=len(C), words=sum(r["words"] for r in C),
             first=C[0]["date"], last=C[-1]["date"],
             byType=dict(Counter(r["type"] for r in C)))
), open("build/data.json","w"), indent=1)

print("clusters:",len(CLUSTERS),"concepts:",len(concepts))
for c in concepts:
    print(f"  {c['cluster']:11s} {c['name'][:30]:32s} {c['docs']:3d}docs {c['hits']:5d}h  th={len(c['theses'])} q={len(c['quotes'])} lk={len(c['links'])}")

# =========================== REVISION LEDGER ===========================
# Curated thesis changes, each anchored to verbatim text already verified in-corpus.
def find(frag):
    for r in C:
        if frag.lower() in r["title"].lower(): return r
    return None
def q(frag, pat, maxlen=520):
    r=find(frag)
    if not r: return None
    rx=re.compile(pat,re.I)
    best=None
    for p in r["text"].split("\n\n"):
        p=" ".join(p.split())
        if rx.search(p) and 60<len(p)<1400:
            if best is None or len(p)<len(best): best=p
    if best and len(best)>maxlen: best=best[:maxlen].rsplit(" ",1)[0]+"…"
    return dict(t=best, d=r["date"], p=r["title"], ty=r["type"]) if best else None

REV=[
 dict(id="bubble", title="Is this a bubble?", cluster="floor",
   turn="Agents changed the answer. Ben argued we were in a bubble in November, reconsidered three weeks later, and formally reversed in March.",
   steps=[q("Benefits of Bubbles", r"We are in an AI Bubble"),
          q("Nvidia Earnings; Power", r"made me reconsider the opening"),
          q("Agents Over Bubbles", r"no longer believe we're in a bubble")]),
 dict(id="vr-ar", title="What separates VR from AR?", cluster="stakes",
   turn="Hands-on time with Meta's Ray-Ban Display overturned Ben's decade-old definition: the line isn't occlusion, it's immersion.",
   steps=[q("AI Hardware, Meta Display", r"changed my mind")]),
 dict(id="google", title="Was Google going to survive the shift?", cluster="reckoning",
   turn="A standing correction. Ben names himself a former Google skeptic and re-reads the company's 'lack of strategy' as the thing that lets it win across paradigms.",
   steps=[q("Paradigm Shifts and the Winner", r"Google skeptic"),
          q("YouTube Tip of the Google Spear", r"much better than I originally expected")]),
 dict(id="meta-risk", title="How exposed was Meta's core business?", cluster="reckoning",
   turn="Zuckerberg's spending spree was read as a signal: the downside Ben had priced in was too small.",
   steps=[q("Checking In on AI and the Big Five", r"bigger than I appreciated")]),
 dict(id="mac", title="Why would anyone want a Mac for AI?", cluster="agentic",
   turn="Ben predicted on-device inference would drive Mac demand. The actual driver was agentic harnesses hammering the CPU while calling cloud models.",
   steps=[q("Microsoft Earnings, Apple Earnings", r"I was wrong that the primary reason")]),
 dict(id="netflix", title="Was Netflix running Hollywood?", cluster="stakes",
   turn="From driving the endgame in December to 'honestly pretty boring' in July, with the collapsed Warner Bros. deal as the hinge.",
   steps=[q("Netflix and the Hollywood End Game", r"Netflix is driving|end game"),
          q("Netflix Earnings, Is Netflix Washed", r"pretty boring at this point")]),
 dict(id="anthropic", title="Is Anthropic's safety posture a liability or an asset?", cluster="borders",
   turn="In March the standoff with the Department of War was 'intolerable.' By June the same conviction reads as a competitive weapon.",
   steps=[q("Anthropic and Alignment", r"intolerable"),
          q("Anthropic's Safety Superpower", r"gives the company license")]),
 dict(id="sora", title="Was AI video just slop?", cluster="stakes",
   turn="Ben expected generated feeds to be noise; what he underrated was creation, not consumption.",
   steps=[q("Sora, AI Bicycles", r"underestimated about Sora"),
          q("Sora, AI Bicycles", r"less about consumption and more about creation")]),
 dict(id="groceries", title="Did Amazon need a grocery network?", cluster="reckoning",
   turn="The answer was to make the general network fast enough that groceries just slot in — 'so obvious in retrospect.'",
   steps=[q("Amazon Earnings, AWS and OpenAI", r"obvious in retrospect")]),
]
REV=[dict(r, steps=[s for s in r["steps"] if s]) for r in REV]
REV=[r for r in REV if len(r["steps"])>=1]

# =========================== COMPANY BOARD ===========================
FIRMS = {
 "Apple": r"\bApple\b", "Google": r"\bGoogle\b|Alphabet|DeepMind|Gemini", "Microsoft": r"\bMicrosoft\b|Azure|Copilot",
 "Meta": r"\bMeta\b|Facebook|Instagram|Zuckerberg", "Amazon": r"\bAmazon\b|\bAWS\b", "Nvidia": r"\bNvidia\b",
 "OpenAI": r"OpenAI|ChatGPT", "Anthropic": r"Anthropic|\bClaude\b", "TSMC": r"\bTSMC\b",
 "Intel": r"\bIntel\b", "Netflix": r"\bNetflix\b", "SpaceX": r"SpaceX|Starlink|\bxAI\b",
 "Oracle": r"\bOracle\b", "YouTube": r"\bYouTube\b",
}
CLTERM = {cl["id"]: re.compile("|".join(f"(?:{p})" for p in cl["terms"].values()), re.I) for cl in CLUSTERS}
BEN_DOCS=[x for x in C if x["type"]!="interview"]
board=[]
for fname, fpat in FIRMS.items():
    frx=re.compile(fpat)
    row=dict(firm=fname, cells={}, total=0)
    for cl in CLUSTERS:
        crx=CLTERM[cl["id"]]; n=0; ex=[]
        for r in BEN_DOCS:
            for p in r["text"].split("\n\n"):
                p=" ".join(p.split())
                if 150<len(p)<1100 and frx.search(p) and crx.search(p):
                    n+=1
                    ex.append((len(crx.findall(p))+len(frx.findall(p)), p, r))
        ex.sort(key=lambda x:-x[0])
        seen=set(); picks=[]
        for s,p,r in ex:
            if r["id"] in seen: continue
            seen.add(r["id"])
            picks.append(dict(t=p[:600].rsplit(" ",1)[0]+("…" if len(p)>600 else ""), d=r["date"], p=r["title"], ty=r["type"]))
            if len(picks)>=2: break
        row["cells"][cl["id"]]=dict(n=n, q=picks)
        row["total"]+=n
    board.append(row)
board.sort(key=lambda x:-x["total"])

d=json.load(open("build/data.json"))
d["revisions"]=REV; d["board"]=board
d["stats"]["benPieces"]=len(BEN_DOCS)
json.dump(d, open("build/data.json","w"), indent=1)
print("\nrevisions:", len(REV), "with steps:", [ (r['id'],len(r['steps'])) for r in REV ])
print("board firms:", len(board))
for b in board[:6]: print("  ",b["firm"], b["total"], {k:v["n"] for k,v in b["cells"].items()})
