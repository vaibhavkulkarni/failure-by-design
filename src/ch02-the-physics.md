# The Physics You Cannot Escape

<div class="coldopen">

<span class="tag">Cold open · fictional on-call log</span>

```
11:02  Harbor's client: POST /orders  (idempotency-key: h-77412)  ... no response after 2s.
11:02  Harbor's client: timeout. Did the order land? Unknown.
11:02  Harbor's client: retry, same key.
11:02  Ash ingestion: first request actually committed at 11:02:01.9. Response was in flight.
11:02  Birch ingestion: second request arrives. Has Ash's commit replicated yet? ...
11:03  support: "Harbor says they sent it once. We have two. Or one. Depends which screen."
```

</div>

Harbor's client did nothing wrong. It could not have known. Between "I sent a request" and "I received a response" lies a gap that no engineering can close, and *every mechanism in this book lives in that gap*.

## The Two Generals problem

Two armies must attack together. Each can only message the other through hostile territory where messengers can be captured. General A sends "attack at dawn." Did B get it? A needs an acknowledgement. But then B wonders whether *the ack* arrived, and needs an ack of the ack… and so on forever.

**No finite protocol gives both sides certainty.** Translated: *over an unreliable channel, the sender of a request can end up not knowing whether it was executed.* That state ("unknown outcome") is not a bug in your client library. It is physics.

Consequence: **exactly-once delivery is impossible in general.** What you *can* build is exactly-once *effect* from *at-least-once delivery + idempotent processing* (Chapter 8).

## FLP: the cost of "maybe dead"

Fischer, Lynch and Paterson showed that in a fully asynchronous network (no bound on message delay), no deterministic algorithm can guarantee that a group will reach agreement if even one member might crash. The intuition is the same gap: a very slow node looks identical to a dead one.

Real systems escape the proof by assuming **partial synchrony**: delays are bounded *eventually*, so timeouts are *usually* right. This is both liberating and dangerous: it means **liveness can stall during bad periods** (a leader election that keeps failing during a network storm), but safety never needs to be violated.

## CAP and PACELC, put to use

During a network partition, a replicated store must choose between **consistency** (refuse some requests) and **availability** (answer, possibly with stale or divergent data). When there is *no* partition, it still trades **latency** against **consistency**. These are not slogans for architecture diagrams. They are *per-operation* decisions:

- "Create an order": we must not lose it (S2). During a partition, accept writes in each cluster and reconcile? Or refuse in the minority side?
- "Show order status": a few seconds of staleness is fine.

## CALM: where coordination is actually needed

The CALM theorem says a computation can be made coordination-free **if and only if it is monotonic**: information only accumulates, and nothing is retracted. Adding items to a set is monotonic. "Balance must never go below zero" is not, because two concurrent withdrawals can each look fine alone.

This gives you a practical filter. For each invariant, ask: *can two replicas each preserve it independently and still preserve it when merged?* (Researchers call this being **invariant-confluent**.)

| Invariant | Coordination-free? | Why |
|---|---|---|
| "Every order has a unique ID" | Yes, if IDs are generated node-independently | No two writers can pick the same value |
| "No duplicate effect for one idempotency key" | **No** | Two clusters could both accept the key; needs a unique-constraint point |
| "Status only moves forward" | Yes | Monotonic progress |
| "Inventory never goes negative" | **No** | Concurrent decrements break it |

> [!TIP]
> Coordination is where availability goes to die. Spend it only on invariants that fail the test, and nowhere else.

## The derivation chain

Here is the most valuable page in the book. Read it as a story, then notice that each line forces the next.

```
Networks can delay, drop, duplicate and reorder messages        (fact)
  → cannot tell slow from dead                                   (Two Generals / FLP)
    → must use timeouts to make progress                         (we want liveness)
      → timeouts produce false positives                         (slow ≠ dead)
        → an operation may or may not have executed              (unknown outcome)
          → we retry or reconcile                                (restore liveness)
            → retries create duplicates                          (safety risk)
              → need idempotency, dedup, fencing                 (restore safety)
            → retries add load                                   (amplification)
              → need budgets, deadlines, shedding                (restore stability)
          → if we can't retry safely                             (still unknown)
            → need reconciliation, sagas, audits                 (eventual correctness)
```

Every "pattern" you know is a line on this chart. Timeouts, retry budgets, idempotency keys, fencing tokens, sagas: all consequences. If you can regenerate the chart from memory, you do not need to memorise the patterns.

## The four currencies

Every tolerance mechanism *spends* something. Naming the currency makes trade-offs visible.

| Currency | You spend | Buys you | Examples |
|---|---|---|---|
| **Space** | More copies, spare capacity | Survives crashes | Replicas, clusters, headroom |
| **Time** | Latency, waiting, retries | Survives transient faults | Timeouts, retry, hedging, buffering |
| **Information** | Metadata, acks, observability | Detection, dedup, ordering | Heartbeats, idempotency keys, fencing tokens |
| **Semantics** | A weaker guarantee | Survives partition and overload | Stale reads, degraded modes, partial results |

You will see later that each currency has a way of going bankrupt: space fails under *correlation*, time fails under *saturation*, information fails under *silent* faults, and semantics fails if you relaxed the wrong invariant.

## Checkpoint

<details>
<summary>1. Harbor timed out and retried with the same key. What two outcomes must the server handle correctly?</summary>

(a) The first attempt *did* commit: the retry must return the original result without creating a second order. (b) The first attempt did *not* commit: the retry must create it exactly once. The server cannot tell which case it is in without looking up the key atomically with the write.

</details>

<details>
<summary>2. Why can't a bigger timeout fix unknown outcomes?</summary>

A longer timeout lowers the *probability* that you give up too early but never removes it, and it costs latency and held resources. The uncertainty is structural, so the fix must be in the protocol (idempotency, reconciliation), not the constant.

</details>

<details>
<summary>3. Classify: "an order's status may only advance from created → priced → dispatched."</summary>

Monotonic (status only moves forward) and therefore coordination-free *if* updates are expressed as "advance to at least X" rather than "set to X." Concurrent writers cannot break it.

</details>

## Takeaways

- You cannot distinguish **slow** from **dead**, so every call can end in **unknown outcome**.
- "Exactly-once" means **at-least-once + idempotent effect**, built, not provided.
- Use **CALM** to find which invariants need agreement; coordinate only for those.
- The **derivation chain** generates the patterns; learn the chain, not the catalogue.
- Every mechanism spends **space, time, information or semantics**.

<div class="notebook">

<span class="tag">Tessera notebook · entry 2</span>

**Rule of unknown outcome.** *Every remote call in Tessera is assumed able to return "I don't know."* Therefore every mutating endpoint accepts a client-supplied idempotency key, and every consumer deduplicates.

**Coordination map (draft).** S1 (one effect per key) needs a single arbiter: a unique constraint inside the datastore. Everything else, including order status and IDs, is designed to be coordination-free.

</div>

**Next:** the physics tells us *what* can go wrong. Part II tells us *how much*. [Counting Nines](ch03-counting-nines.md).
