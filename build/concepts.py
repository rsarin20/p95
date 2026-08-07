import json, re
from collections import Counter, defaultdict
C = json.load(open("build/corpus.json"))

STOP = set("""The This That These Those There Then Their They It Its In On At Of To A An And But Or For With As By From If So We I You He She His Her Was Were Is Are Be Been Being Have Has Had Do Does Did Not No Yes What When Where Which Who Whom How Why All Some Any Both Each Few More Most Other Such Only Own Same Than Too Very Can Will Just Should Now One Two Three First Second Last Next New Old Good Great Big Small Long Short High Low Right Left My Our Your Me Us Him Them Also However Meanwhile Moreover Therefore Thus Instead Indeed Perhaps Actually Really Still Yet Even Because While During After Before Since Until About Above Below Under Over Again Further Once Here Very Mr Ms Dr Inc LLC Co Ltd Q1 Q2 Q3 Q4 CEO CFO CTO COO AI US U.S UK EU EUR USD Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Stratechery Ben Thompson Update Article Interview Listen Good morning""".split())

# Find recurring Title-Case multiword phrases = Ben's named concepts
phrase_docs = defaultdict(set)
phrase_count = Counter()
for r in C:
    text = r["text"]
    # sentence-internal capitalized runs (skip sentence starts by requiring preceding lowercase/comma)
    for m in re.finditer(r'(?<=[a-z,;:] )((?:[A-Z][a-zA-Z\']+|the|of|and|as|in|for|vs\.?|versus)(?: (?:[A-Z][a-zA-Z\']+|the|of|and|as|in|for|vs\.?|versus)){1,4})', text):
        p = m.group(1).strip()
        words = p.split()
        if len(words) < 2: continue
        if words[0] in STOP or words[-1] in STOP: continue
        if not re.match(r'^[A-Z]', words[0]): continue
        if sum(1 for w in words if w[0].isupper()) < 2: continue
        phrase_count[p] += 1
        phrase_docs[p].add(r["id"])

rows = [(p, phrase_count[p], len(phrase_docs[p])) for p in phrase_count if len(phrase_docs[p]) >= 4]
rows.sort(key=lambda x: (-x[2], -x[1]))
print("=== RECURRING NAMED PHRASES (>=4 distinct pieces) ===")
for p,c,d in rows[:150]:
    print(f"{d:4d} docs {c:5d}x  {p}")
