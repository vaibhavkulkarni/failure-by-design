# CLAUDE.md

Context for working on **Failure by Design**, an mdBook about designing for failure in microservices and distributed systems. Read this before editing anything.

## What this project is

A first-principles field guide, **not a pattern catalogue**. The thesis: patterns (retry, breaker, bulkhead) are *answers*; the book teaches the *questions* so the right mechanism can be derived. Three pillars: **physics** (what cannot be escaped), **mathematics** (how much failure, which lever), **method** (ten steps with written outputs), then a **layer-by-layer tour** (Layers 0-10).

Audience: working backend/platform engineers (JVM, Kubernetes/OpenShift, Kafka/JMS-style messaging, multi-cluster). Assume competence; do not explain what a pod or a topic is. Do explain *why*.

## Repo layout

```
book.toml                  mdBook config (MathJax on, search on, custom CSS/JS)
src/SUMMARY.md             table of contents (5 parts + appendices)
src/introduction.md        preface, Tessera intro, reading paths
src/ch01 ... ch18 *.md     chapters
src/appendix-a..d *.md     formulas, game days, glossary, reading
theme/custom.css           .coldopen, .notebook, .widget, .epigraph styling
theme/widgets.js           interactive widgets + pure model code (Core)
.github/workflows/pages.yml  build + deploy to GitHub Pages
```

## Commands

```bash
mdbook serve --open        # live preview, http://localhost:3000
mdbook build               # output in ./book (git-ignored)
```

Requires **mdBook 0.5.x** (GitHub-style alerts `> [!NOTE]` are native from 0.5). The CI workflow pins the version in `MDBOOK_VERSION`; keep it in step with what you build locally.

## Chapter map (cross-references depend on these numbers)

| Part | Chapters |
|---|---|
| I Foundations | 1 Failure Is the Weather, 2 The Physics |
| II Mathematics | 3 Counting Nines, 4 Correlation (β), 5 Tail and Queue, 6 Feedback, 7 Detection/leases/fencing, 8 Idempotency |
| III Method | 9 Budgets and Risk, 10 Ten-Step Framework |
| IV Layers | 11 L0-2 Ground/Wire/Platform, 12 L3-4 Runtime/Calls, 13 L5 Messaging, 14 L6-7 State/Meaning, 15 L8-10 Change/Eyes/People |
| V Practice | 16 Tessera Case, 17 Proving It, 18 Review Kit |

Text refers to chapters as "Ch. 5", "Chapter 6", and by link. **If you insert or renumber a chapter, grep for `Ch\.`, `Chapter `, and `.md)` and fix every reference**, including the notebook numbering and the Review Kit's chapter column.

## Chapter template (keep this rhythm)

1. `# Title` (plus italic layer note for Part IV)
2. **Cold open**: a short fictional on-call log in `<div class="coldopen">`
3. Concepts, derived not asserted; formulas followed by a worked number
4. **Try it**: `<div class="widget" data-widget="NAME"></div>` where useful
5. Pitfall callout(s) (`> [!WARNING]`)
6. **Checkpoint**: 3 questions in `<details><summary>` with answers
7. **Takeaways** bullets
8. `<div class="notebook">` **Tessera notebook · entry N** (chapters 1-15 and 17 have one; 16 and 18 do not)
9. `**Next:**` link to the following chapter

Part IV chapters use a table per layer: *What fails / Key question / Math / See it*, then a **Stance** list.

## Formatting rules and gotchas

- **Teaching pattern for every formula (Parts II-III): plain numbers first, then symbols.** Order each concept as: *The question* -> *Start with plain numbers* (a small worked case anyone can follow, e.g. 100 requests through two 90% hops) -> *Now with symbols* -> *Reading the result* (units check, analogy) -> *Where this stops being true*. Define every symbol on first use. Prefer enumeration tables and area/timeline diagrams to bare algebra. Put prerequisite maths in a `<div class=\"primer\">` box at the start of a chapter. Keep calculus in a collapsed `<details>` as optional. Chapter 3 is the reference implementation of this pattern; Chapters 4-9 should be brought to the same standard.
- **Widgets must be visible in all themes** (light, navy, coal, ayu). Prefer DOM/SVG with `currentColor` and opacity over canvas with fixed greys. Test headlessly (see below) in light and navy.
- **Derivation boxes (required for every formula in Parts II-III):** `<div class="derivation">` with a purple tag, containing **Question, Assumptions, numbered Derivation steps, Reading the result (limits, worked number, analogy), Where it breaks**. Never state a formula without its derivation or an explicit "stated, not derived" label (e.g. Kingman's approximation). Derive from first principles: probability rules (independence multiplies, mutually exclusive events add, complement), geometric series, linearity of expectation, counting, Little's argument, balance equations, first-order linearisation.
- **Intuition boxes (older style):** maths chapters (3-9) use `<div class="intuition">` (why a formula is true: analogy, derivation, limiting cases) and `<div class="rules">` (rules of thumb, placed just before Checkpoint). Same blank-line rule as `coldopen`. Each formula should be followed by a worked number *and* a plain-language picture.

- **Alerts:** `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`. They render in mdBook and on GitHub.
- **HTML blocks containing Markdown** (`coldopen`, `notebook`): put a **blank line** after the opening `<div>` and before `</div>`, or the inner Markdown will not render.
- **Math** is MathJax: inline `\\( ... \\)`, display `\\[ ... \\]`.
  - Markdown eats escapes before punctuation. Write thin spaces as `\\,` and `\\;` (double backslash), never `\,` or `\;`. After editing a file run: `sed -i 's/\\,/\\\\,/g; s/\\;/\\\\;/g' FILE` **only if you wrote single-backslash forms**, never twice.
  - Punctuation after a backslash is eaten by Markdown: write `\\,` `\\;` `\\!` (double) for spacing commands. Avoid primes (`g'`), because smart-punctuation curls the apostrophe; avoid `*` and `|` inside formulas.
  - Do not put `%` in the middle of a formula (MathJax treats it as a comment). At the very end of a span it is harmless; otherwise write it in prose.
  - Prefer braces for subscripts (`a_{i}`); keep expressions simple to avoid stray emphasis parsing. **Avoid `\underbrace{...}_{...}`**: two `_` in one paragraph get paired into `<em>` and corrupt the formula; explain the terms in prose instead. After a build, scan built HTML for `<em>` inside `\(...\)` spans.
- **No wide tables in prose-heavy sections**; tables are for comparisons and lookups.
- **Typography:** use smart punctuation naturally; avoid long em-dash chains. Keep paragraphs short.
- **Never reproduce copyrighted text.** Appendix D cites works by title and author only.

## Tessera canon (the fictional running system; keep consistent)

Freight-order platform. Shippers `POST` orders; Tessera validates, prices via a **third-party carrier-rate API**, stores in a **multi-master SQL datastore (one logical DB)**, publishes via a **transactional outbox** to an **event log**, consumed by billing, dispatch, notifications. Auth tokens come from an external identity provider. **Three active clusters: Ash, Birch, Cedar** behind a global traffic manager. Roughly 100 services in reality; the book focuses on ~10. Characters: **you** (new platform engineer) and **Ines** (on-call lead who asks the reviewer questions). Client "Harbor Logistics" appears in incidents.

Invariants: **S1** at most one effect per idempotency key. **S2** an acknowledged order is never lost. **L1** 99% of accepted orders reach dispatch within 60 s (appears in Ch. 1, Ch. 9, Ch. 16; change all together). **L2** 99.95% ack availability, p99 < 500 ms.

Established numbers (do not drift without updating every use):

| Item | Value |
|---|---|
| Sync hard path | traffic manager, ingress/mesh, ingestion, datastore write |
| Illustrative path availability | 0.9999 x 0.9999 x 0.9999 x 0.99995 = **0.99965** (about 184 min/yr) |
| Margin vs 99.95% (263 min/yr) | about **79 min/yr**; at beta 0.2 margin ~26 min; at beta 0.3 path = 0.99945 (a **miss**) |
| Steady-state utilisation target | rho <= 0.5 per cluster (loss of one gives 0.75 on survivors) |
| Carrier-call cap | 300 req/s x 150 ms = 45 in flight, cap 60 |
| Retry policy | client SDK and ingress only; budget 10% of base traffic; jittered backoff; `Retry-After` on sheds |
| Idempotency key retention | at least 30 days |
| DLQ policy | 5 attempts then DLQ; re-drive limited to 10% of consumer capacity |
| Cluster rollout order | Cedar, Birch, Ash |
| Certificate alerts | 30 / 14 / 7 days |

Notebook entries are cumulative: entry N may reference earlier entries. Chapter 16 replays every cold open against the final design; **if you add a cold open, add a row to that replay table**.

## Widgets (`theme/widgets.js`)

- A widget is `<div class="widget" data-widget="NAME"></div>`. Registered names: `series`, `ccf`, `shuffle`, `fanout`, `queue`, `drain`, `retry`, `meta`, `burn`, `downtime`, `dots`, `little`, `phi`, `cobweb`, `survival`, `bulbs`.
- Pure model code lives in `Core` (also exported for node). The DOM code is vanilla JS, no dependencies, no network calls.
- To add a widget: add `W.name = (el) => {...}` using the `slider`, `title`, `outBox`, `canvas` helpers; sliders are moved above the output automatically on boot.
- **`Core.simulate`** (the retry-storm toy) must keep the property that: no protection and retries on **collapses**; retries off, or retry budget, or shedding **recovers**. Ch. 6's "Things to try" list depends on that. Re-verify after any change:

```bash
node -e 'const C=require("./theme/widgets.js");
for (const o of [{r:0},{r:2},{r:2,budget:true},{r:2,shed:true}]) {
  const d=C.simulate(o); console.log(JSON.stringify(o), d.slice(-10).reduce((s,x)=>s+x.goodput,0)/10);
}'
# expected end goodput: 70, 0, 70, 70
```

- Test DOM behaviour headlessly with `jsdom` (stub `HTMLCanvasElement.prototype.getContext`). For real rendering (themes, MathJax, screenshots) use `puppeteer-core` with `@sparticuz/chromium`, and serve MathJax 2.7.x from `node_modules/mathjax` via request interception on the cdnjs URL. There is no committed test harness yet.

## Content principles

1. **Derive, then name.** Show why a mechanism follows from the physics or the numbers before naming it.
2. **Every formula is derived on the page, then given a worked number and a plain reading.** Label made-up inputs "illustrative". State assumptions explicitly: they are where formulas break.
3. **Be honest about margins and limits.** Show sensitivity (e.g., what flips the SLO), list accepted risks.
4. **Currencies:** every mechanism spends **space, time, information, or semantics**; say which.
5. **Safety before liveness** unless an invariant says otherwise; classify invariants with CALM.
6. **Caller's view is the truth** for health and detection.
7. Avoid pattern-first prose. If you write "use a circuit breaker", the previous sentence must have derived why.

## Before you commit

- [ ] `mdbook build` succeeds with no warnings
- [ ] Every new formula has a worked number; arithmetic re-checked
- [ ] Cross-references and chapter links resolve; `SUMMARY.md` updated
- [ ] Math escapes follow the rules above (grep for `\\,` and `\\;`, and no bare `%` mid-formula)
- [ ] Checkpoint answers present for each question
- [ ] Notebook entry added (and Ch. 16 replay row, if a new incident was introduced)
- [ ] Tessera numbers unchanged, or changed everywhere (Ch. 3, 5, 9, 16, appendices)
- [ ] If widgets changed: simulate check above and a browser look

## Known caveats

- Widgets and MathJax require the **mdBook site**. On github.com the raw `.md` shows text but formulas appear as `\\( ... \\)` and widgets do not run.
- MathJax loads from a CDN; fully offline reading needs a vendored copy.

## CI

`.github/workflows/pages.yml` installs a pinned mdBook release binary, builds, and deploys via `actions/upload-pages-artifact` + `actions/deploy-pages`. Repository setting required: **Settings > Pages > Source: GitHub Actions**. When bumping actions, move `upload-pages-artifact` and `deploy-pages` together (matching majors).
