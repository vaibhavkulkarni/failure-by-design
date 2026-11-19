# Failure by Design

*A first-principles field guide to failure in microservices and distributed systems.*

Not a pattern catalogue. A book about the **physics** (what you cannot escape), the **mathematics** (how much failure to expect and which lever matters), and a **method** (ten steps with written outputs), followed by a **layer-by-layer tour** from hardware to humans. Along the way you follow a fictional platform, **Tessera**, through eighteen chapters of cold-open incidents, interactive widgets, checkpoints and design-notebook entries.

## Contents

| Part | Chapters |
|---|---|
| **I. Foundations** | Failure is the weather · The physics you cannot escape |
| **II. The mathematics of breaking** | Counting nines · Correlation · Tails and queues · Feedback · Detection · Idempotency |
| **III. The method** | Budgets and risk · The ten-step framework |
| **IV. Layer by layer** | Ground/wire/platform · Runtime/calls · Messaging · State/meaning · Change/eyes/people |
| **V. Practice** | The Tessera case · Proving it · The review kit |
| **Appendices** | Formula sheet · Game-day workbook · Glossary · Further reading |

## Build locally

You need [mdBook](https://rust-lang.github.io/mdBook/) 0.5 or newer.

```bash
# install (pick one)
cargo install mdbook
# or download a release binary from https://github.com/rust-lang/mdBook/releases

mdbook serve --open     # live preview at http://localhost:3000
mdbook build            # static site in ./book
```

## Layout

```
book.toml                 mdBook configuration (MathJax on, search on)
src/SUMMARY.md            table of contents
src/*.md                  chapters and appendices
theme/custom.css          cold opens, notebook boxes, widget styling
theme/widgets.js          the interactive calculators and the retry-storm simulator
.github/workflows/pages.yml
```

### Writing conventions

- Each chapter: **cold open → concepts → Try it → pitfalls → checkpoint → takeaways → Tessera notebook**.
- Callouts use GitHub-style alerts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`), which render in mdBook and on GitHub.
- Math uses `\\( inline \\)` and `\\[ display \\]` (MathJax). In a Markdown source, write `\\,` and `\\;` for thin spaces, and avoid `%` in the middle of a formula.
- A widget is one line: `<div class="widget" data-widget="series"></div>`. Available widgets: `series`, `ccf`, `shuffle`, `fanout`, `queue`, `drain`, `retry`, `meta`, `burn`. Add new ones in `theme/widgets.js`.
- Illustrative numbers are labelled as such; Tessera is fictional.

## Contributing

Corrections, new cold opens, additional game-day scenarios and widgets are welcome via pull request. Please keep derivations short, numbers checkable, and every claim either derived in the text or cited in Appendix D.

## License

Check `LICENSE` file.
