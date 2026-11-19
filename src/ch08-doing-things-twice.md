# Doing Things Twice

<div class="coldopen">

<span class="tag">Cold open · fictional on-call log</span>

```
Mon 09:00  Dispatch consumer dedups by message key. Dedup table retention: 24 hours.
Tue 14:00  Broker incident. Consumer group offsets reset to Monday 08:00 "to be safe".
Tue 14:05  Replay begins. Messages older than 24h have no dedup record. 
Tue 14:06  Truck assignments sent twice for ~1,900 orders.
Tue 14:30  Retention was an assumption. It had never been written down as an invariant.
```

</div>

At-least-once delivery is the only delivery guarantee you can actually build. It means **duplicates are not an edge case; they are the contract**. This chapter is about making duplicates harmless.

## What you can and cannot have

| Guarantee | How | Cost |
|---|---|---|
| **At-most-once** | Send once, never retry | Loses messages on omission |
| **At-least-once** | Retry until acknowledged | Duplicates |
| **Exactly-once *effect*** | At-least-once + idempotent processing (or atomic commit of effect and progress) | Dedup state; key design |

"Exactly-once delivery" does not exist (Chapter 2). A broker's "exactly-once" feature gives exactly-once *within its own boundary*, for example read-process-write between topics. The moment you touch something outside it (an HTTP call, a database row, an email), you are back to at-least-once and need idempotency.

## Idempotence is algebra

An operation \\( f \\) is **idempotent** if applying it twice equals applying it once:

\\[ f(f(x)) = f(x) \\]

| Operation | Idempotent? | Fix |
|---|---|---|
| `SET status = 'dispatched'` | Yes | none |
| `INSERT order ... ON CONFLICT DO NOTHING` | Yes | none |
| `balance = balance + 10` | **No** | Record operation ID; apply once |
| "Send confirmation email" | **No** | Dedup record keyed by order + template |
| "Append event to log" | **No** | Natural key or event ID |

A stronger set of properties makes retries, reordering **and** replication all safe: operations that are **associative, commutative and idempotent (ACI)**. Data types built this way (CRDTs) merge in any order and any number of times. For each mutation in your system, ask: *can I express it as ACI or as a monotonic update; if not, which dedup mechanism applies?*

## Four parameters of a dedup scheme

1. **Window.** Dedup records must outlive the longest possible redelivery: retry horizon + queue retention + consumer lag + *operational replays*. The cold open's failure was a window shorter than a replay.
2. **Atomicity.** `if not seen(key): apply(); mark(key)` is a race unless the check and the effect are one atomic unit: a single transaction, a unique constraint, or an outbox/inbox row committed together with the state change.
3. **Key semantics.** The key must identify the *business intent* (a client-generated request ID), not the transport attempt. A new connection must reuse the same key. And a request with a known key but a *different payload* must be rejected, not silently treated as a duplicate (store a payload fingerprint).
4. **Volume.** Small probabilities multiply. At \\( 10^9 \\) messages a day, a duplicate rate of \\( 10^{-6} \\) is **a thousand duplicates daily**. "Rare" is not "never."

> [!WARNING]
> **Pitfall: dedup in memory.** A cache is lost on restart, and restart is exactly when duplicates arrive. Dedup state must be as durable as the effect it protects.

## The dual-write trap (derived, not memorised)

Suppose a service saves an order to the database and then publishes an event to the broker. These are two separate operations. If the process crashes *between* them:

```
write DB ✔   crash   publish ✘   →  order exists, nobody told   (lost event)
publish ✔    crash   write DB ✘   →  event sent, order missing   (phantom event)
```

No ordering of the two steps is safe. The only fix is to make **one** of them the source of truth and **derive** the other. The **transactional outbox**: write the order *and* an outbox row in one database transaction; a relay reads the outbox and publishes (at-least-once), and consumers deduplicate. Atomicity is then local, and the unknown-outcome gap is covered by retry plus idempotency.

## Ordering is a separate guarantee

- *Per-entity* ordering needs a single sequencer for that entity (one partition per key).
- *Global* ordering needs consensus and is almost never worth it.
- Make correctness depend only on per-entity order, and protect state with a **version check**: apply an update only if `version = expected`, otherwise reject or re-read. This makes stale and reordered messages harmless.

## When you cannot retry: forward recovery and reconciliation

Some steps are not safely repeatable (charge a card, book a truck). For multi-step workflows:

- Model the process as a **persisted state machine** with idempotent, resumable transitions.
- Prefer **forward recovery** (retry until it completes) when a step must eventually succeed.
- Use **compensation** only where there is a meaningful business undo (cancel a booking).
- Run **reconciliation**: periodically compare two systems' views of the same truth and repair differences. It is the safety net for the unknown outcomes nothing else caught.

## Checkpoint

<details>
<summary>1. A consumer applies `quantity = quantity - 1` on each event. How do you make it idempotent?</summary>

Store the processed event ID (or per-entity sequence number) in the same transaction as the decrement, and skip when it is already present. Alternatively, convert to a *state-based* event ("quantity is now 7") if the producer can supply it.

</details>

<details>
<summary>2. A client reuses idempotency key K for two different orders. What should the server do?</summary>

Detect the mismatch via a stored payload fingerprint and return an error (commonly HTTP 409/422). Treating it as a duplicate would silently drop the second order.

</details>

<details>
<summary>3. How long must dedup records live?</summary>

At least as long as the longest period in which the same message can be redelivered, including operational replays and the DLQ re-drive horizon. If that is unbounded, make the effect itself naturally idempotent (a unique constraint on a natural key).

</details>

## Takeaways

- Build **at-least-once + idempotent effect**; there is no free lunch in delivery.
- Idempotence is **algebra**: prefer ACI/monotonic updates, else atomic dedup.
- Dedup has four parameters: **window, atomicity, key semantics, volume.**
- **Dual-writes are unsafe**; use an outbox (or derive one side from the other).
- Use **per-entity order + version checks**, **forward recovery**, and **reconciliation**.

<div class="notebook">

<span class="tag">Tessera notebook · entry 8</span>

**`POST /orders` contract.** Client supplies `Idempotency-Key`. In **one** transaction the server inserts the key (unique constraint), the order and an outbox row. A repeated key with the same fingerprint returns the original response; a different fingerprint returns 422. Keys are retained for **at least 30 days**, longer than any replay we have ever run.

**Consumers** record `(consumer, message-id)` atomically with their effect. Per-order versions reject stale updates.

</div>

**Next:** we now have the physics and the maths. Part III turns them into a method. [Budgets, Risk, and Priorities](ch09-budgets-and-risk.md).
