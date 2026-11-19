# The Tessera Case

<div class="coldopen">

<span class="tag">Cold open · fictional, a quarter later</span>

```
Ines:   "Peak season starts Friday. Walk me through it."
You:    "Three clusters. Ten services on the order path. One datastore. One event log."
Ines:   "What breaks first?"
You:    "I have a matrix with sixty-one rows. Let me show you the top five."
Ines:   "Good. Now tell me why each one is survivable."
```

</div>

This chapter assembles the notebook entries into a single design, then **replays every cold open** from the book to see whether it holds up.

## The design on one page

| Step | Tessera's answer |
|---|---|
| **1. Invariants** | S1: one effect per idempotency key. S2: no acknowledged order lost. L1: 99% of accepted orders to dispatch in 60 s. L2: 99.95% ack availability, p99 < 500 ms. |
| **2. Graph** | Sync hard path: traffic manager → ingress/mesh → ingestion → datastore. Soft: carrier pricing (cached tariff). Async: event log → billing, dispatch, notifications. |
| **3. Fault matrix** | 61 rows across Layers 0–10; top risks by RPN: carrier gray failure, replay duplicates, shared config. |
| **4. Numbers** | Sync availability ≈ 99.965% (thin margin); ρ ≤ 0.5 per cluster; recovery drain at ρ = 0.5 is 1× the outage. |
| **5. Responses** | Mask with idempotent retry; bound with deadlines; refuse early; degrade pricing; choose consistency for S1, availability for status reads. |
| **6. State** | Home cluster per order; unique-key arbiter; outbox; per-order versions; reconciliation hourly. |
| **7. Overload** | Per-dependency caps; shedding by priority; 10% retry budget; jittered backoff; warm-up ramp. |
| **8. Detectors** | Burn-rate alerts; caller-side metrics; external probe; lag growth; DLQ; reconciliation diffs. |
| **9. Verify** | Quarterly game days (Appendix B); steady-state experiments in staging and in a canary cell. |
| **10. Operate** | Cluster-by-cluster rollouts with auto-abort; staggered certificates; incident updates the matrix. |

## The numbers, with an honest margin

Using the illustrative component values from Notebook 3:

| Hop | Availability |
|---|---|
| Global traffic manager | 0.9999 |
| Ingress / mesh | 0.9999 |
| Ingestion (1-of-3 clusters, \\( a = 0.999 \\), \\( \beta = 0.1 \\) so \\( U \approx 10^{-4} \\)) | 0.9999 |
| Datastore write path | 0.99995 |
| **Product** | **≈ 0.99965** (about 184 min/year) |

The target of 99.95% allows about 263 minutes a year, so we have roughly **79 minutes of margin**. That feels comfortable until you ask the Chapter 4 question. If the real β for ingestion is **0.3** rather than 0.1, the service term falls to 0.9997 and the product to about **0.99945**: a **miss**.

> [!IMPORTANT]
> **The margin is smaller than the uncertainty in the inputs.** Treat this as a *sensitivity result*: the design depends on keeping β low. That is why "stagger every change across clusters" is an SLO-critical rule, not a hygiene nicety.

Capacity: three clusters at steady \\( \rho \le 0.5 \\) means a lost cluster leaves survivors at \\( 0.75 \\), under the 0.8 ceiling, and recovery after a 60 s outage drains in 60 s.

## A matrix excerpt

| Layer | Fault | Model | Detector | Response |
|---|---|---|---|---|
| 1 | Certificate expiry | Time-correlated | Time-to-expiry alerts | Staggered lifetimes, rotation drills |
| 2 | Liveness probe tied to dependency | Self-inflicted | Review + restart-rate alert | Process-only liveness |
| 4 | Pricing endpoint gray | Gray | Caller-side per-endpoint outcomes | Outlier ejection; cached tariff |
| 5 | Poison message | Deterministic | DLQ rate, lag growth | Bounded retries; DLQ |
| 6 | Cross-cluster conflicting writes | Concurrency | Conflict counter | Single home cluster per order |
| 8 | Bad config to all clusters | Correlated change | Burn rate, change markers | Staged rollout; auto-abort |

## Replay: the book's incidents against the new design

| Cold open | What would happen now | Entries |
|---|---|---|
| **Ch. 1**: gray TLS to one carrier IP | Caller-side outcome stats eject the bad endpoint within seconds; pricing falls back to cached tariff, marked as estimate | 5, 12 |
| **Ch. 2**: duplicate order after client timeout | Retry with the same key returns the original result; S1 holds | 2, 8 |
| **Ch. 3**: 20 hops at three nines | Only four hops are hard-synchronous; the rest are async or soft | 3, 12 |
| **Ch. 4**: one typo, three clusters | Typo reaches Cedar only; auto-abort on burn; Birch and Ash untouched | 4, 15 |
| **Ch. 5**: slow dependency drains the pool | Per-dependency cap sheds at 60 in-flight; other paths unaffected | 5, 12 |
| **Ch. 6**: 8-second blip, 2-hour outage | Retry budget caps amplification; shedding keeps queues short; no collapse | 6 |
| **Ch. 7**: GC-paused leader publishes late | Fencing token rejected by the datastore; no duplicates | 7 |
| **Ch. 8**: replay beyond the dedup window | Keys retained 30 days, longer than any replay | 8 |
| **Ch. 11**: liveness probe restarts the fleet | Process-only liveness; no restart storm | 11 |
| **Ch. 13**: poison message blocks a partition | Five attempts, then DLQ; lag growth alert | 13 |
| **Ch. 14**: LWW discards a cancellation | Home-cluster ownership; no timestamp arbitration | 14 |
| **Ch. 15**: cert expiry, blind and locked out | Staggered certs; external probe; independent break-glass | 15 |

> [!NOTE]
> That table is the book's point. Each cold open was *one* line of the derivation chain left unhandled; the design is simply every line, written down.

## What the design still does not cover

Honesty is part of the method. Tessera still has accepted risks, and they should be written next to the design:

- **A bug that writes wrong-but-valid data** everywhere. Mitigated only by reconciliation after the fact.
- **A third-party outage longer than the cached tariff's validity.** Orders queue unpriced, with explicit status, until it returns.
- **Correlated failure of the datastore** across clusters (it is one logical database). Its restoration drill defines the real RTO.
- **Operator error during incident response.** Mitigated by runbook default actions and rehearsal, not eliminated.

## Checkpoint

<details>
<summary>1. If the real β is 0.2, does the design meet 99.95%?</summary>

Service \\( U \approx 2\times10^{-4} \Rightarrow 0.9998 \\). Product: \\( 0.9999 \times 0.9999 \times 0.9998 \times 0.99995 \approx 0.99955 \\). Still passes, but only by about 26 minutes a year. A reasonable conclusion: invest in measuring β before spending anywhere else.

</details>

<details>
<summary>2. Which single decision removes the most risk per unit effort?</summary>

Candidates: *staged rollouts* (cheap, cuts β for the largest class of correlated failures) and *demoting dependencies to async/soft* (removes series terms). In most systems the first is cheapest; the second has the biggest ceiling.

</details>

<details>
<summary>3. Pick one row from the replay table and say which currency it spends.</summary>

For example, the retry budget spends **semantics** (some requests are refused rather than retried) and **information** (counting retries); fencing spends **information** (a token) to buy safety; staged rollout spends **time**.

</details>

## Takeaways

- The design is the **ten steps' outputs, assembled**.
- **Sensitivity analysis** beats point estimates: find which input flips the result.
- **Replay incidents** against the design; each should map to written rules.
- **List accepted risks** explicitly.

**Next:** how do you know the design works? [Proving It](ch17-proving-it.md).
