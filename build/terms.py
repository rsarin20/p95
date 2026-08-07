import json, re
from collections import Counter, defaultdict
C = json.load(open("build/corpus.json"))

TERMS = {
 # --- Aggregation / demand ---
 "Aggregation Theory": r"aggregation theor", "aggregator": r"\baggregator", "owns the customer": r"own(?:s|ing)? the (?:customer|user) relationship",
 "demand vs supply": r"\bcontrol(?:ling)? demand|demand generation|zero marginal cost",
 "commoditize complements": r"commoditiz\w+ (?:its|their|the)? ?complement",
 "conservation of attractive profits": r"conservation of attractive profits",
 # --- Integration / modularity ---
 "integration": r"\bintegrat(?:ion|ed|ing)\b", "point of integration": r"point of integration",
 "modularity": r"\bmodular(?:ity|ization|ized)?\b", "vertical integration": r"vertical(?:ly)? integrat",
 "commoditization": r"\bcommoditiz(?:ation|ed|ing|e)\b",
 # --- Disruption / paradigm ---
 "disruption": r"\bdisrupt(?:ion|ive|ed|ing)?\b", "sustaining innovation": r"sustaining (?:technolog|innovation)",
 "paradigm shift": r"paradigm(?: shift)?", "winner's curse": r"winner'?s curse", "incumbent": r"\bincumbent",
 # --- Compute scarcity ---
 "opportunity cost of compute": r"opportunity cost", "compute constraint": r"compute (?:constrain|shortage|scarcit)|constrained compute",
 "the TSMC brake": r"TSMC brake", "capex": r"\bcapex\b|capital expenditure",
 "power/energy limit": r"\bpower (?:is|as|constrain|limit)|electricity|gigawatt|megawatt",
 "inference vs training": r"\binference\b", "marginal cost": r"marginal cost",
 # --- Agents ---
 "agents": r"\bagent(?:s|ic)?\b", "agentic inference": r"agentic inference",
 "scaffolding": r"\bscaffold(?:ing)?\b", "tokens": r"\btoken(?:s)?\b",
 # --- Bundling / business models ---
 "bundling": r"\bbundl(?:e|es|ing|ed)\b", "the internet solvent": r"internet solvent",
 "transaction costs": r"transaction cost", "coordination costs": r"coordination cost", "sunk costs": r"sunk cost",
 "subscriptions": r"\bsubscription", "advertising model": r"\badvertis(?:ing|ement)",
 # --- Safety / alignment / politics ---
 "alignment": r"\balign(?:ment|ed|ing)\b", "AI safety": r"\bsafety\b", "jailbreak": r"jailbreak",
 "regulation": r"\bregulat(?:ion|ory|ors?)\b", "government control": r"government (?:control|customer)|Department of War",
 "export controls": r"export control|chip control",
 # --- Geopolitics / supply chain ---
 "China": r"\bChina\b|Chinese", "Taiwan": r"\bTaiwan", "rare earths": r"rare earth",
 "resiliency": r"\bresilien(?:cy|t|ce)\b", "supply chain": r"supply chain", "open weights": r"open(?:-| )(?:weight|source) model",
 # --- Devices / interface ---
 "thin client": r"thin client|thick client", "hardware differentiation": r"hardware (?:differentiat|defined)",
 "AR/VR": r"\b(?:AR|VR)\b|augmented realit|virtual realit", "the interface": r"\buser interface\b|\bUI\b|form factor",
 # --- Content / attention ---
 "attention": r"\battention\b", "creators": r"\bcreator(?:s)?\b", "content and community": r"content and communit",
 "gatekeepers": r"\bgatekeep(?:er|ers|ing)\b", "IP/franchise": r"\bIP\b|franchise",
 # --- Enterprise / software ---
 "SaaS": r"\bSaaS\b|software.as.a.service", "software survival": r"usurp|software (?:is|will be) ", 
 "enterprise": r"\benterprise", "vibe coding": r"vibe cod",
 # --- Tech philosophy ---
 "tech philosophy": r"tech philosoph", "bubble": r"\bbubble", "the Big Five": r"[Bb]ig Five",
}

rows=[]
for name, pat in TERMS.items():
    rx = re.compile(pat, re.I)
    docs=0; hits=0
    for r in C:
        n=len(rx.findall(r["text"]))
        if n: docs+=1; hits+=n
    rows.append((name, docs, hits, round(100*docs/len(C))))
rows.sort(key=lambda x:-x[1])
print(f"{'CONCEPT':34s} {'docs':>5s} {'/172':>5s} {'hits':>6s}")
for n,d,h,p in rows: print(f"{n:34s} {d:5d} {str(p)+'%':>5s} {h:6d}")
