# State and Meaning

*Layers 6–7: data, and the business logic that gives it meaning.*

<div class="coldopen">

<span class="tag">Cold open · fictional on-call log</span>

```
13:05:02.311  Ash:   order O-5521  status := "dispatched"      (clock: 13:05:02.311)
13:05:02.900  Cedar: order O-5521  status := "cancelled"       (clock: 13:05:02.250, Cedar's clock runs 700 ms slow)
13:05:03.400  Replication merges. Policy: last-writer-wins by timestamp.
13:05:03.400  Result: status = "dispatched". The customer's cancellation was silently discarded.
13:05:03.401  No error was raised anywhere. Every component did what it was told.
```

</div>

The data layer rarely fails loudly. It fails by *quietly agreeing on the wrong answer*. Layers 6 and 7 are where invariants live, so this is where Chapter 2's CALM filter earns its keep.

---

## Layer 6: Data and state

| | |
|---|---|
| **What fails** | Replica lag and stale reads; **split brain**; write conflicts in multi-writer systems; lost updates; **clock-skew-driven last-writer-wins errors**; failed failover (loss beyond RPO); schema-migration failures and locks; **ID/sequence collisions** across nodes or after failover; hot partitions; **corruption that replicates faithfully**; backups that cannot be restored; full storage; long transactions blocking everything |
| **Key question** | For each entity: **who is the authority**, how can two writers conflict, and what does the system do when it detects a conflict? |
| **Math** | Quorum overlap \\( R+W>N \\); staleness as a random variable; RPO/RTO; I-confluence of invariants (Ch. 2); ID-space collision probability |
| **See it** | Replication lag, conflict counts, lock waits, long transactions, **restore-test results**, reconciliation diffs, constraint-violation rate, sequence headroom |

### Stance

**1. Prefer a single owner per entity to resolving conflicts later.** If exactly one cluster may write an order at a time (by key range or home region), conflicts cannot happen. In multi-master databases, *conflict avoidance by design* beats *conflict resolution by policy*, because policies like "last write wins" lose data silently (Ch. 7).

**2. Spend coordination only where CALM says you must.**

| Invariant | Mechanism |
|---|---|
| Unique idempotency key | A unique constraint at one arbiter |
| "Status only advances" | Monotonic update (`advance to at least X`); no coordination |
| "Inventory ≥ 0" | Reservation with a single authority, or escrow per region |
| Unique IDs | **Node-independent generators**, or provably disjoint ranges |

**3. Generate IDs so that collisions are impossible by construction.** Plan how ranges or sequences behave across failover, migration and clock changes. Where IDs embed timestamps, treat clock regression as a failure mode.

**4. Change schemas in compatible, reversible steps.**

| Phase | What happens | Compatibility |
|---|---|---|
| **Expand** | Add the new column/table; old code unaffected | Old and new code both work |
| **Migrate** | Backfill and dual-read/write as needed, in small batches | Either version works |
| **Contract** | Remove the old structure only after nothing uses it | Rollback window explicitly closed |

At every moment, **any adjacent versions of the app must work with the current schema**, so rollback is always possible. Beware migrations that take long locks or rewrite whole tables at peak.

**5. Test restoration, not backups.** Your real RPO and RTO are what a *restore drill* achieves. Untested backups have an effective recovery probability you cannot state.

**6. Verify integrity independently.** Replication faithfully copies corruption. Checksums, referential audits and **reconciliation** between systems are the only defence against a bug that writes wrong data everywhere.

> [!WARNING]
> **Pitfall: using a timestamp to settle a disagreement.** Clocks are never perfectly synchronised (Ch. 7). If *losing* a concurrent update is unacceptable, use versions, compare-and-set or version vectors, or give the entity a single writer.

---

## Layer 7: Application logic and business meaning

| | |
|---|---|
| **What fails** | Unknown-outcome operations; **half-finished workflows**; non-idempotent side effects (emails, payments); invalid or adversarial input; logic bugs that corrupt data; edge cases (nulls, huge payloads, Unicode, time zones/DST); **poison requests that crash a worker and are then retried by clients**; unbounded payloads or recursion; concurrency breaking business rules |
| **Key question** | What is the **business-level state machine**, and what are its states when things stop halfway? |
| **Math** | State machines and invariants; saga correctness: *every reachable intermediate state has a forward or compensating path*; idempotency algebra (Ch. 8) |
| **See it** | Age of workflows stuck in each state, compensation rate, reconciliation diffs, business KPIs next to technical ones |

### Stance

**1. Model workflows as persisted, explicit state machines.**

```
RECEIVED → VALIDATED → PRICED → ACCEPTED → DISPATCHED → DELIVERED
              │            │         │
              └──REJECTED  └──PRICE_UNAVAILABLE (retry later) ... └──CANCELLED
```

Each transition is **idempotent and resumable**. A process that crashes mid-workflow must be able to *resume from the stored state*, not restart blindly.

**2. Prefer forward recovery; compensate only when there is a business meaning.** "Retry until priced" is usually right. "Un-send a truck" may not exist.

**3. Validate at every trust boundary and bound everything**: payload size, depth, rate, string length. A request that crashes a worker is a vulnerability, because *client retries propagate it* to every worker in turn.

**4. Choose fail-open or fail-closed per feature.** Authorisation fails *closed*; recommendation widgets fail *open*. Decide in advance and test both.

**5. Reconcile.** A periodic job comparing two systems' views of the same truth (orders vs billing vs dispatch) catches the unknown outcomes nothing else noticed. It is the ultimate safety net and should be a first-class feature.

## Checkpoint

<details>
<summary>1. How would you fix the cold open without a single global lock?</summary>

Give each order a **home cluster** that is the only writer of its status, or use versioned updates (compare-and-set) where "cancelled" and "dispatched" are *distinct, mergeable events* with a defined business precedence, not overwrites. Replace timestamp-based LWW by version vectors or explicit state-machine rules.

</details>

<details>
<summary>2. Why is "expand then contract" necessary even when you can deploy app and schema "at the same time"?</summary>

There is no such thing as simultaneous. During any rollout, old and new app versions coexist with the same schema, and rollback must remain possible. Expand/contract makes every intermediate state valid.

</details>

<details>
<summary>3. What does reconciliation catch that retries and idempotency do not?</summary>

Outcomes that no component knew about: a message that was acknowledged but never processed, a workflow stuck in the wrong state, divergence caused by a bug. It compares *truth* rather than relying on delivery guarantees.

</details>

## Takeaways

- Data fails by **agreeing on the wrong answer**; check each invariant against CALM.
- **Single owner per entity** beats conflict resolution.
- **Schema changes**: expand, migrate, contract, always rollback-safe.
- **Restore drills** define RPO/RTO; **reconciliation** is the last line of defence.
- Model workflows as **persisted state machines**; **validate every boundary**.

<div class="notebook">

<span class="tag">Tessera notebook · entry 14</span>

**State map.** Orders have a *home cluster* (consistent hash of the order ID) that is the sole writer of status; the datastore's unique constraint arbitrates idempotency keys; IDs are generated node-independently; status uses monotonic "advance" updates.

**Workflow.** The order state machine above is persisted; a reconciliation job compares orders with billing and dispatch hourly and alerts on any diff older than one hour.

</div>

**Next:** the layers that surround the system: change, observation, and the people. [Change, Eyes, and People](ch15-change-eyes-people.md).
