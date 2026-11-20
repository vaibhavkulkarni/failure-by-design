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

<div class="derivation">

<span class="tag">Derivation · where the delivery guarantees come from</span>

**Question.** A consumer must do some work (apply an effect) and record that it did so (commit progress). It can crash between any two steps. What can it guarantee?

**Derivation.** Enumerate the two possible orders and the crash that falls *between* the steps.

1. **Record, then work.** Crash in between: progress says "done", but the work never happened. On restart the message is skipped. **Lost work: at-most-once.**
2. **Work, then record.** Crash in between: the work happened, but progress says "not done". On restart the message is redelivered. **Repeated work: at-least-once.**
3. There is no third ordering that closes the gap *if the two steps live in different systems*, because each is durable on its own and a crash can fall between them (the Two Generals problem again).
4. You can close the gap in exactly two ways: put both steps in **one atomic unit** (one database transaction), or make the work **idempotent** so repeating it changes nothing.

**Result.**

| Guarantee | How | Cost |
|---|---|---|
| **At-most-once** | Record first | Loses work on a crash |
| **At-least-once** | Work first | Duplicates |
| **Exactly-once *effect*** | At-least-once plus idempotent processing, or atomic commit of effect and progress | Dedup state; key design |

A broker's "exactly-once" feature gives exactly-once *within its own boundary* (read-process-write between its own topics). The moment you touch something outside it (an HTTP call, a database row, an email), you are back to at-least-once and need idempotency.

</div>

## Idempotence is algebra

<div class="derivation">

<span class="tag">Derivation · making repetition harmless</span>

**Definition.** An operation \\( f \\) is **idempotent** if applying it twice equals applying it once: \\( f(f(x)) = f(x) \\).

1. *Any number of repeats collapses to one.* By induction: \\( f(f(f(x))) = f(f(x)) = f(x) \\), and so on. So at-least-once delivery plus an idempotent \\( f \\) is exactly-once in effect.
2. *Turning a non-idempotent operation into an idempotent one.* Keep a set \\( S \\) of processed message IDs. Define the wrapped operation: "if the ID is in \\( S \\), do nothing; otherwise apply \\( f \\) and add the ID to \\( S \\)". Apply it twice: the second time the ID is already in \\( S \\), so nothing changes. The wrapped operation is idempotent even if \\( f \\) is not.
3. *Reordering and regrouping.* If operations are also **commutative** (\\( a \cdot b = b \cdot a \\)) and **associative** (\\( (a\cdot b)\cdot c = a\cdot(b\cdot c) \\)), the result depends only on *which* messages arrived, not their order or grouping. Set union has all three properties (\\( A\cup B = B\cup A \\), \\( (A\cup B)\cup C = A\cup(B\cup C) \\), \\( A\cup A = A \\)). Such **ACI** operations are safe under duplication, reordering and replication together. A pile of sticky notes in a bowl does not care if a note is added twice or in a different order.

**Reading the result: destinations, not directions.** A *destination* says where you should end up; replaying it is harmless. A *direction* says how to move; replaying it moves you again.

| Harmless to replay (destinations) | Harmful to replay (directions) |
|---|---|
| set a value | toggle |
| insert if absent | add to a balance |
| add to a *set* (union) | append to a *list* |
| "order is cancelled" | "send an email" |

Prefer state-based events (`quantity is now 7`) over deltas (`decrement`).

</div>

## Four parameters of a dedup scheme

<div class="derivation">

<span class="tag">Derivation · window, atomicity, keys, volume</span>

**1. Window.** A duplicate can arrive up to some delay \\( H \\) after the original. You can only recognise it while you still remember the original, so the dedup record must live at least \\( H \\):

```text
 now ◄──────────── redelivery horizon H ────────────►  past
     [ dedup memory must cover at least this span ]
```

\\( H \\) is the *sum* of the worst cases that can chain: retry horizon + queue retention + consumer lag + operational replays. (The sum is deliberately conservative: it assumes the worst of each at once.) The cold open failed because the window (24 hours) was shorter than a replay (36 hours).

**2. Atomicity.** Check-then-act is a race. Two copies of the same message arrive concurrently; both check "have I seen this?", both see "no", both apply, so the effect happens twice. The fix is to make the check and the effect one atomic step: a unique constraint (the database serialises the two inserts and rejects the second), a single transaction, or an outbox/inbox row committed with the state change.

**3. Key semantics.** The key must identify the *business intent* (a client-generated request ID), not the transport attempt, otherwise a retry on a new connection looks new. A request with a known key but a *different payload* must be rejected, so store a payload fingerprint.

**4. Volume.** Let \\( N \\) messages each have duplicate probability \\( p \\).

- The **expected** number of duplicates is \\( Np \\). This needs no independence: an expected count is a sum of probabilities (*linearity of expectation*).
- If duplicates are independent, the probability of *at least one* is \\( 1-(1-p)^N \approx 1 - e^{-Np} \\), the same dice rule as Chapter 5.

| Messages/day | Duplicate rate | Expected duplicates/day | Verdict |
|---|---|---|---|
| \\( 10^{3} \\) | \\( 10^{-6} \\) | 0.001 | never seen in testing |
| \\( 10^{6} \\) | \\( 10^{-6} \\) | 1 | seen weekly |
| \\( 10^{9} \\) | \\( 10^{-6} \\) | 1,000 | an everyday event |

So never ask "can it happen?" Ask **"how many per day?"**

</div>

> [!WARNING]
> **Pitfall: dedup in memory.** A cache is lost on restart, and restart is exactly when duplicates arrive. Dedup state must be as durable as the effect it protects.

## The dual-write trap (derived, not memorised)

<div class="derivation">

<span class="tag">Derivation · why two writes are never safe</span>

**Question.** A service must save an order to a database and publish an event to a broker. Is there a safe ordering of the two steps?

**Derivation.** Enumerate both orders and a crash between them.

```text
write DB ✔   crash   publish ✘   →  order exists, nobody told   (lost event)
publish ✔    crash   write DB ✘   →  event sent, order missing   (phantom event)
```

1. Order 1 leaves a *lost event*. Order 2 leaves a *phantom event*. Neither is safe, and no reordering helps, because the gap *between* two separate durable steps cannot be closed.
2. The only way out is to make **one** of them the source of truth and **derive** the other. **Transactional outbox:** write the order *and* an outbox row in **one** database transaction (atomic, so no gap). A relay reads the outbox and publishes at-least-once; consumers deduplicate.
3. Atomicity is now local, and the remaining unknown-outcome gap is covered by retry plus idempotency.

**Reading the result.** You cannot walk through two doors at the same instant. Put the letter and the receipt in **one envelope** (one transaction), and let a courier (the relay) deliver the envelope as many times as needed. Receivers recognise the receipt and ignore repeats.

</div>

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

<div class="rules">

<span class="tag">Rules of thumb</span>

1. **Send destinations, not directions.** Prefer state-based events to deltas.
2. **Rare × volume = routine.** Compute expected duplicates per day.
3. **Your dedup memory must outlast your longest replay.**
4. **Atomic or nothing:** the check, the effect and the marker live in one transaction.
5. **One envelope:** never write the database and the broker as two steps.

</div>

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
