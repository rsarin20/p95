# The Stratechery Stack

An interactive reading of 172 Stratechery dispatches (Jun 2025 – Aug 2026, ~798,000 words)
as a single causal argument rather than an archive.

**`stratechery-stack.html`** — the app. Self-contained, no network calls.

## The thesis the app is built on

The corpus is not 172 topics. It is one shock — agents becoming genuinely useful —
propagating through six layers, bounded by two envelopes it cannot escape:

| | Layer | The question it answers |
|---|---|---|
| 01 | The Agentic Turn | What changed? |
| 02 | The Shape of Demand | What does the new workload need? |
| 03 | The Physical Floor | What runs out first? |
| 04 | The Chokepoint | Who captures the value? |
| 05 | The Meter | How does compute become revenue? |
| 06 | The Reckoning | Which incumbents survive it? |
| — | Borders & Rules | *envelope:* what states allow |
| — | Attention & the Human Stakes | *envelope:* what it is finally for |

Four ways in: the **Stack** (48 concepts, each with verbatim dated quotes),
**Mind-Changes** (9 documented thesis reversals), the **Board** (14 firms × 8 layers),
and the full **index** of 172 dispatches with Ben's own one-line thesis for each.

## Build

```
python3 build/extract.py   # mailbox JSON -> corpus/ + build/corpus.json
python3 build/data.py      # corpus -> build/data.json (concepts, revisions, board)
python3 build/render.py    # data + template -> stratechery-stack.html
node build/shot.js         # screenshot every view, both themes; assert no errors/overflow
```

## Provenance rules

- Every quotation is verbatim from a dated email. Nothing was fetched from the web.
- Counts are measured over the **130** dispatches that are Ben's own analytical writing
  (33 Articles + 96 Updates + Year in Review). The **42** Interviews are guest dialogue —
  searchable in the app, excluded from every statistic.
- Concept matching is sense-specific, not keyword: a bare search for `power` catches
  "bargaining power", `space` catches "the consumer AI space", `jobs` catches "Steve Jobs".
- In the UI, **serif is Ben's words; monospace is the app's.**
- The 8 groupings, their names, the causal claim, and the selection of mind-changes are
  editorial judgements, labelled as such in the app's Method tab.
