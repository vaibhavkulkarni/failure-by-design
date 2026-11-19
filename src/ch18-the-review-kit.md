# The Review Kit

<div class="coldopen">

<span class="tag">Cold open · fictional design review</span>

```
A new service proposal lands. The doc has a "Resilience" section: "We use retries and a circuit breaker."
Ines (comment): "Which invariants does this protect? What is the unknown-outcome story?
                 What do the replicas share? Who else retries? How would you know it failed?"
Author (reply, 3 days later): "...Let me redo section 4."
```

</div>

Everything in this book compresses into a set of questions. This chapter is the compressed version: bring it to design reviews, post-incident reviews and your own whiteboard.

## The twelve questions

Ask these of any component, service or change. Each points back to the chapter that explains it.

| # | Question | Chapter |
|---|---|---|
| 1 | What are the **invariants** (safety) and **SLOs** (liveness)? Which need coordination? | 1, 2 |
| 2 | For every remote call: what happens on **unknown outcome**? | 2 |
| 3 | What is the **composite availability** of the critical path, and which terms dominate? | 3 |
| 4 | What do the **replicas share**? What is **β**? What is the blast radius? | 4 |
| 5 | What is the **capacity after losing a fault domain**, and the **recovery drain time**? | 5 |
| 6 | Is every **pool, queue and wait bounded**, with an overflow policy? | 5, 12 |
| 7 | Who **retries**, with what budget, and is the operation idempotent? | 6 |
| 8 | What **feedback loops** exist, and what cuts each? | 6 |
| 9 | How does the system **decide something is dead**, and what protects us when it is wrong? | 7 |
| 10 | How are **duplicates and reordering** made harmless? What is the dedup window? | 8 |
| 11 | How is each failure **detected**, from the **caller's** side? | 10, 15 |
| 12 | What has been **tested** under failure, and when was the recovery path last run? | 17 |

> [!TIP]
> If you only ever ask three: **#2 (unknown outcome), #4 (what do replicas share), #7 (who retries).** Between them they find a startling share of real defects.

## Checklists by area

### Model and assumptions
- [ ] Invariants listed, classified (coordination-free vs needs agreement), owned
- [ ] Failure model stated per component, and defensible
- [ ] Shared-fate register: global DNS, identity, config, mesh control plane, CI/CD, observability

### Quantification
- [ ] Composite availability computed along each critical path, with correlation, against the SLO
- [ ] Capacity under loss of the largest fault domain, with ρ below target afterwards
- [ ] Recovery capacity computed for each queue and backlog
- [ ] Latency percentile budget derived from fan-out structure

### Interactions and overload
- [ ] Every call: **deadline, concurrency cap, retry budget (one layer), idempotency story**
- [ ] Every queue/pool/buffer: bounded, with a defined overflow action
- [ ] Every feedback loop named and cut
- [ ] Load-shedding policy with priorities; a brownout mode

### State and messaging
- [ ] No dual writes; effect and dedup atomic; dedup window ≥ redelivery horizon
- [ ] Poison-message handling and a rate-limited re-drive
- [ ] Fencing or equivalent for each single-active role; no wall-clock safety
- [ ] Collision-free IDs across fault domains; single ownership to avoid conflicts
- [ ] Schema and contract changes: expand → migrate → contract, rollback-safe

### Change and time
- [ ] Staged, auto-aborting rollouts across fault domains; validated config
- [ ] Every certificate, token, secret, quota and sequence has an expiry monitor and a rotation drill

### Detection and recovery
- [ ] Every fault-matrix row has a detector, or is an explicit accepted silent risk
- [ ] Observability independent of the domain it observes; independent break-glass access
- [ ] Recovery procedures (failover, restore, rollback, re-drive) executed recently

## Myths, corrected

| Myth | Reality |
|---|---|
| "Three replicas means three more nines" | Only if independent. β sets the ceiling. |
| "Retries make us resilient" | Retries convert faults into load; under saturation they cause collapse. |
| "Exactly-once delivery" | Impossible in general. Build exactly-once *effects* inside a defined boundary. |
| "Health check passed means healthy" | It means the check passed. Judge by what callers see. |
| "Average latency is fine" | Fan-out turns leaf tails into aggregate medians. |
| "Timeouts detect failure" | They detect slowness; slow ≠ dead. Every timeout has false positives and an unknown outcome. |
| "Active-active means more capacity" | Without N+k headroom, it amplifies failure. |
| "Last-write-wins is simple" | It silently discards data under skew and concurrency. |
| "We'll add reliability later" | Hop count, hard dependencies and state ownership are architectural. |
| "Chaos testing proves resilience" | It tests hypotheses; it does not prove the absence of unknown failure modes. |
| "Our dependency's SLA is our SLA" | You are at best the *product* of your hard dependencies. |

## A fill-in template for a new service

```text
SERVICE:                         OWNER:                      REVIEWED:
1. INVARIANTS     safety:                         liveness / SLO:
2. DEPENDENCIES   hard:            soft (fallback + value):          async:
3. STATE          source of truth:    single writer?    idempotency key:    dedup window:
4. NUMBERS        path availability:    β estimate:    capacity after domain loss:    drain time:
5. FAILURE MATRIX (≥ 10 rows) fault | model | detector | blast radius | response | currency
6. OVERLOAD       caps (Little):    shedding order:    retry budget:    loops and cuts:
7. CHANGE         rollout order:    auto-abort signal:    expiry items:
8. VERIFY         experiments run:    invariant checkers:    last restore / failover drill:
9. ACCEPTED RISKS (explicit):
```

## Takeaways

- **Twelve questions** cover the book. Three of them find most defects.
- A review is good if it produces **written outputs** (invariants, matrix, numbers) that can be challenged.
- The kit is a *loop*: each incident should update it.

**Appendices:** [Formula Sheet](appendix-a-formulas.md) · [Game Day Workbook](appendix-b-game-days.md) · [Glossary](appendix-c-glossary.md) · [Further Reading](appendix-d-reading.md)
