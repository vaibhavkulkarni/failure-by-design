# Messaging

*Layer 5: queues, logs and event streams.*

<div class="coldopen">

<span class="tag">Cold open · fictional on-call log</span>

```
05:02  dispatch-consumer, partition 7: lag 0 → 18,000 → 140,000.
05:03  Other partitions: fine.
05:04  Partition 7, offset 9,118,402: payload fails schema validation. Consumer throws.
05:04  Consumer retries the same message forever. (Never commits, never skips.)
05:05  One malformed message from one client now blocks every order that hashes to partition 7.
05:40  Someone manually skips the offset. Fourteen minutes later, the same client sends another.
```

</div>

Messaging is where Tessera's promises about *time* and *ordering* live. It is also where duplicates, loss and stuck partitions hide. We will treat it as its own layer because its failure modes are different from request/response.

| | |
|---|---|
| **What fails** | **Duplicates** (redelivery after a crash before commit); **loss** (commit before processing, weak acks, unclean leader election); **reordering**; consumer-group **rebalance storms**; **lag growth**; **poison messages**; schema/version skew; replica (ISR) shrinkage; transaction-coordinator failure; retention expiring before consumption; no backpressure |
| **Key question** | What is the **unit of atomicity** between "I consumed" and "my state changed", and between "my state changed" and "I told the world"? |
| **Math** | At-least-once + idempotency (Ch. 8); \\( T_{\text{drain}} = T\rho/(1-\rho) \\) (Ch. 5); lag as an integral of \\( \lambda - \mu \\); per-key order needs one sequencer |
| **See it** | Lag **and its derivative**, redelivery counts, DLQ rate, rebalance frequency, oldest-message age, produce errors, duplicate-detection hit rate |

## Where does the commit go?

The single most consequential line in a consumer is *when it acknowledges progress*.

| Order | Crash between the two steps leads to | Verdict |
|---|---|---|
| **Commit, then process** | Message lost (acked, never processed) | At-most-once. Rarely what you want. |
| **Process, then commit** | Message reprocessed | At-least-once. **Default**, paired with idempotent effects. |
| **Process and commit atomically** | Neither or both | Effectively-once *within one transactional boundary* |

The correct skeleton:

```text
loop:
  batch = poll()
  for msg in batch:
      begin transaction
          if seen(consumer, msg.id): skip           # dedup, same transaction as the effect
          else: apply_effect(msg); mark_seen(consumer, msg.id)
      commit transaction
  commit offsets                                      # AFTER the effects are durable
```

A broker's transactional feature gives exactly-once *inside that broker*. Effects outside it (a database row, an HTTP call) are still at-least-once and need the dedup above.

## Poison messages are a design item, not an incident

The cold open is the standard failure: *a message that will never succeed, and a consumer that will never skip it.* Decide the policy in advance:

```
attempt 1 .. N   → retry with backoff       (N small: 3–5)
after N failures → move to a dead-letter queue with the failure reason and original metadata
                   alert on DLQ rate; keep the partition moving
re-drive         → deliberate, rate-limited, after the cause is fixed
```

Two subtleties:

- **Distinguish poison from transient.** A downstream outage is *not* a bad message; moving every message to the DLQ during an outage is a different disaster. Retry on dependency errors; quarantine on *validation* errors.
- **Ordering.** Skipping a message breaks per-entity order for that entity. For order-sensitive streams, park the *entity* (hold its later messages) instead of dropping the one message.

## Ordering and parallelism

Ordering is provided **per partition** (or per queue). You get order per key only if all messages with that key go to one partition, **and** the consumer processes that partition sequentially. Retries in the *producer* can reorder messages unless configured against it. Design so that correctness depends only on **per-entity** order, and add **version checks** so stale messages are rejected (Ch. 8).

## Rebalances, lag and recovery headroom

A **rebalance** pauses consumption. If a consumer is slow (a GC pause, a long batch) and misses its heartbeat or poll deadline, the group rebalances, pausing *everyone*, increasing lag, making consumers slower (Ch. 6's rebalance storm).

- Keep **poll intervals and batch sizes** consistent with processing time; do slow work off the poll thread, or bound batch duration.
- Prefer **cooperative rebalancing** and **stable member identity** where available, so a restart does not trigger a full reshuffle.
- Size consumers at \\( \rho \\) well below 1. At \\( \rho = 0.9 \\) a 60-second pause takes nine minutes to recover (Ch. 5). **Lag is only healthy if it drains.**

Alert on *lag growth rate*, not just lag: a lag of 10,000 that is falling is fine; a lag of 1,000 that is rising is the incident.

## Multi-cluster consumers

When consumers run in several clusters, decide **who is allowed to process which messages**:

| Model | Property | Risk |
|---|---|---|
| **Single active** consumer per queue/partition | Ordering and exclusivity preserved | Needs a fenced lease; failover delay |
| **Partitioned ownership** (each cluster owns a key range) | Both clusters work; ordering per key | Rebalancing keys needs care |
| **Competing consumers** (anyone may take any message) | Highest availability | Order lost; *requires* idempotency |

A network partition must not give you two "single active" consumers: use fencing (Ch. 7), not wall-clock leases.

## The outbox at the source

The producer side of reliability is Chapter 8's **transactional outbox**: write the business change and an outbox row in one transaction; a relay publishes with at-least-once semantics; consumers deduplicate. Never write to the database and the broker as two independent steps.

> [!WARNING]
> **Pitfall: retention as an invariant you never wrote down.** If broker retention is 7 days but your dedup records last 24 hours, or your DLQ re-drive happens after retention expires, you have a hidden window where loss or duplication is possible. Write retention, dedup window and re-drive horizon *side by side*.

## Checkpoint

<details>
<summary>1. A consumer processes, commits the offset, then crashes before the next batch. What happens on restart?</summary>

It resumes after the committed offset. Nothing is reprocessed because the commit was *after* the effect. If instead the crash was between processing and committing, the batch is redelivered and dedup protects you.

</details>

<details>
<summary>2. A downstream database goes down for 3 minutes. The consumer sends 500,000 messages to the DLQ. What went wrong?</summary>

The failure policy treated a transient dependency error as a poison message. Retry with backoff (or pause consumption) on dependency errors; only quarantine on deterministic validation failures.

</details>

<details>
<summary>3. Lag is 50,000 and flat. Is that bad?</summary>

Not necessarily: if offered load equals throughput, lag is constant and the *age* of the oldest message tells you whether it breaches the SLO. If you cannot burn it down, you have no recovery headroom (\\( \rho \approx 1 \\)).

</details>

## Takeaways

- Commit **after** the effect; make effects **idempotent**.
- Have a **poison-message policy** distinguishing transient from deterministic failure.
- Depend on **per-entity order** with version checks; never global order.
- Rebalances are pauses: size for **recovery**, watch **lag growth**.
- In multi-cluster setups, define **who may consume what**, with **fencing**.
- Write **retention, dedup window and re-drive horizon** next to each other.

<div class="notebook">

<span class="tag">Tessera notebook · entry 13</span>

**Event log rules.** Producers use the outbox; consumers dedup atomically with effects and commit after; poison messages go to a DLQ after 5 attempts with reasons; re-drive is rate-limited to 10% of consumer capacity. Dispatch consumers use **partitioned ownership by order ID** across clusters.

**Alerts:** oldest-message age against the 60 s SLO · lag growth rate · DLQ rate · rebalance count.

</div>

**Next:** the data layer, and the business meaning above it. [State and Meaning](ch14-state-and-meaning.md).
