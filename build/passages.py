import json, re, sys
C = json.load(open("build/corpus.json"))
DEF = re.compile(r"\b(is that|means that|the reason|which is why|in other words|the point is|this is the|the key|fundamentally|the implication|what matters|the question is|the answer is|because)\b", re.I)

def paras(r):
    for p in r["text"].split("\n\n"):
        p=" ".join(p.split())
        if 220 < len(p) < 1500: yield p

def top(pat, n=4, label=""):
    rx=re.compile(pat, re.I); out=[]
    for r in C:
        for p in paras(r):
            if not rx.search(p): continue
            s = len(rx.findall(p))*3 + len(DEF.findall(p))*2
            if r["type"]=="article": s+=3
            if r["type"]=="interview": s-=2
            out.append((s, r["date"], r["type"], r["title"], p))
    out.sort(key=lambda x:-x[0])
    seen=set(); res=[]
    for s,d,t,ti,p in out:
        if ti in seen: continue
        seen.add(ti); res.append((s,d,t,ti,p))
        if len(res)>=n: break
    print(f"\n{'='*100}\n### {label or pat}\n{'='*100}")
    for s,d,t,ti,p in res: print(f"\n[{d} {t}] {ti}\n  {p}")

for label,pat in [
 ("AGENTS / AGENTIC DEMAND", r"agentic|\bagents\b"),
 ("COMPUTE SCARCITY / OPPORTUNITY COST", r"opportunity cost|compute (?:constrain|shortage|scarcit)|constrained compute"),
 ("INFERENCE SHIFT", r"agentic inference|inference (?:is|will|shift)"),
 ("AGGREGATION THEORY", r"aggregation theor|\baggregator"),
 ("INTEGRATION / POINT OF INTEGRATION", r"point of integration|integration is|integrated approach"),
 ("PARADIGM SHIFT / WINNERS CURSE", r"paradigm shift|winner'?s curse"),
]: top(pat, 3, label)
