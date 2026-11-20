# Welcome to Tessera

<p class="epigraph">Everything fails, all the time. The question is what your system does next.</p>

This is a book about designing distributed systems that keep their promises while parts of them are broken.

It is **not** a catalogue of patterns. You already know retries, circuit breakers and bulkheads, and they matter. But a pattern is an *answer*, and this book is about the *questions* that make the right answer fall out. If you can derive a mechanism from the facts of the situation, you can design for failures no catalogue has named yet.

The book rests on three ideas:

1. **Physics.** A small set of unavoidable facts (you cannot tell slow from dead, clocks disagree, messages get duplicated) generate almost every mechanism we use.
2. **Mathematics.** A handful of formulas (composition, correlation, queueing, feedback) tell you *how much* failure you will see and *which* design lever is worth pulling.
3. **Method.** A repeatable process turns those into a design you can review, test, and operate.

## Meet Tessera

To keep things concrete, the whole book follows one fictional system. **Tessera** is a freight-order platform. Shippers `POST` orders; Tessera validates them, prices them against a third-party carrier-rate API, stores them, and announces them to billing, dispatch and notifications.

```
                 shippers (HTTP, retrying clients)
                              │
                     ┌────────▼─────────┐
                     │  global traffic  │
                     └──┬─────┬──────┬──┘
                        │     │      │
                   ┌────▼┐ ┌──▼──┐ ┌─▼───┐
                   │ Ash │ │Birch│ │Cedar│     three active clusters
                   └──┬──┘ └──┬──┘ └──┬──┘
        ingestion ────┤       │       │──── ingestion  (stateless)
                      ▼       ▼       ▼
                multi-master SQL (one logical DB)
                              │  outbox
                              ▼
                        event log (Kafka)
                   ┌──────────┼───────────┐
                billing     dispatch   notifications
                              │
                      carrier-rate API (third party)
         tokens for every call come from an external identity provider
```

Roughly a hundred services exist in the real Tessera. We will focus on about ten, because the principles do not change with the count; only the arithmetic gets worse.

You are the new platform engineer. **Ines** is the on-call lead who will show up in the margins with the questions a good reviewer asks. The pager is, regrettably, also a character.

> [!NOTE]
> Tessera is invented. Any resemblance to your system is because distributed systems fail in a small number of ways, repeated endlessly.

## How the book is built

Every chapter has the same rhythm, so you always know where you are:

| Element | What it is |
|---|---|
| **Cold open** | A short, fictional on-call log. Read it first; the chapter explains what happened. |
| **Concepts** | The idea, derived rather than asserted. |
| **Derivation** | Every formula in Parts II and III is derived on the page: *Question → Assumptions → Steps → Reading the result → Where it breaks*. You never have to take a formula on trust. |
| **Try it** | An interactive widget. Drag sliders, break things, see the numbers move. |
| **Pitfalls** | The mistakes that survive code review. |
| **Checkpoint** | Questions with hidden answers. Commit to an answer before you peek. |
| **Notebook** | What we add to Tessera's running design document. By Chapter 16 you will have written it. |

## Three ways to read

- **The 45-minute path.** Chapters 1, 2, 3, 5, 6, then the [Review Kit](ch18-the-review-kit.md). You will have the mental model and a checklist.
- **The working-engineer path.** Part I and II skim-read for the formulas, then Part III and the layer chapters you own.
- **The full path.** In order, doing every Checkpoint. Budget a few evenings; the widgets reward play.

> [!TIP]
> Keep a scratch file open. When a chapter says "Notebook", write the entry for *your* system, not Tessera's. That is where the book pays for itself.

## Conventions

- Each formula comes with its derivation (a purple box), then a worked number, then a plain-language reading. If the algebra scares you, read the *Reading the result* paragraph first, then come back for the steps. The **Assumptions** line tells you exactly when a formula stops being true.
- "Hard dependency" means the request cannot succeed without it. "Soft" means it can degrade. "Async" means it can wait.
- Illustrative numbers are labelled. Replace them with your measurements before making decisions.

Ready? Let's start with a Tuesday night.
