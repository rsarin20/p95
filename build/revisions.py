import json, re
C = json.load(open("build/corpus.json"))
REV = re.compile(r"(I (?:no longer|now|used to|previously|had) (?:believe|think|thought|assumed|expected|argued|said|wrote)|I(?:'ve| have) (?:changed|updated|revised|come to|been wrong)|I was wrong|changed (?:my|how I) (?:mind|think)|completely changed|in retrospect|I under(?:estimated|rated)|I over(?:estimated|rated)|reconsider|revisit(?:ed|ing)? (?:my|that|this)|more (?:bullish|bearish|skeptical|optimistic) than I|than I (?:originally |initially )?(?:expected|thought|anticipated))", re.I)
hits=[]
for r in C:
    for p in r["text"].split("\n\n"):
        p=" ".join(p.split())
        if not (150<len(p)<1100): continue
        m=REV.findall(p)
        if m: hits.append((r["date"], r["type"], r["title"], len(m), p))
hits.sort(key=lambda x:x[0])
print(f"TOTAL revision-signal paragraphs: {len(hits)}  across {len(set(h[2] for h in hits))} pieces\n")
for d,t,ti,n,p in hits:
    if t=="interview": continue
    print(f"[{d} {t}] {ti}\n  {p}\n")
