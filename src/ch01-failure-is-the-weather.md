# Failure Is the Weather

<div class="coldopen">

<span class="tag">Cold open · fictional on-call log</span>

```
02:14  PAGE  customer-support: "orders from Harbor Logistics are 'pending' forever"
02:16  ack.  dashboards: ALL GREEN. error rate 0.2%. p99 310ms. all pods Ready.
02:21  curl against Ash ingestion: 201 Created. works fine.
02:30  Harbor retries from their side: 201, 201, 201.   (they can't tell why we're slow)
02:44  carrier-rate API, TLS handshake to *one* of its 3 IPs: hangs 30s. Others fine.
02:51  ~1 in 3 of Harbor's requests lands on the bad IP. Our health check calls a different endpoint.
03:05  workaround: pin the client to the healthy IPs. Root cause: partial network fault upstream.
```

Nothing crashed. Nothing alarmed. Customers were hurt for fifty minutes.

</div>

Ines, over chat: *"Which component failed?"* You list candidates, and each answer is only partly true. This is the central lesson of the chapter: **failure is rarely a component dying; it is a system behaving wrongly while its parts report that they are fine.**

## The ladder: fault → error → failure

Three words, used carefully, prevent a lot of muddled thinking.

| Term | Meaning | In the log above |
|---|---|---|
| **Fault** | The underlying cause | One upstream IP with a broken TLS path |
| **Error** | Wrong internal state | Our connection pool filling with hung handshakes |
| **Failure** | A visible deviation from the promised behaviour | Orders stuck pending |

A fault can be **dormant** (a bug that needs a rare input), **active**, or **masked** (the error never reaches a user). Fault tolerance means **stopping the ladder at some rung**. Each layer's *failure* is the next layer's *fault*, which is exactly why problems cascade upward through a stack.

> [!IMPORTANT]
> Whenever you design anything, ask: *"If this component misbehaves, which rung do I stop it on, and what do I spend to do so?"*

## Safety and liveness: what are you protecting?

Every guarantee you make is one of two kinds.

- **Safety**: *nothing bad ever happens.* No order is charged twice. No acknowledged order is lost.
- **Liveness**: *something good eventually happens.* Every accepted order is processed. Requests complete.

Under failure, you often cannot keep both. The art is deciding, **per invariant and in advance**, which to sacrifice. A payment system sacrifices liveness (refuses to proceed) to protect safety (never double-charge). A recommendations widget does the opposite. Writing this choice down before the incident is most of the battle.

## The failure-model spectrum

"Failure" is a spectrum of behaviours. Choose the *weakest* assumption you can defend, because stronger fault models cost more.

| Model | What the component does | Typical source | Cost to tolerate |
|---|---|---|---|
| **Crash-stop** | Halts, stays gone | Node loss | Replicas |
| **Crash-recovery** | Halts, returns, may lose memory | Pod restart, OOM kill | Durable state + idempotent replay |
| **Omission** | Drops messages | Packet loss, full queues | Acks, retransmission, dedup |
| **Timing** | Responds, but late | GC pause, CPU throttling | Deadlines, shedding |
| **Gray / partial** | Works for some requests or paths | Bad NIC, one hot shard, one bad IP | Observe from the *client's* side |
| **Byzantine** | Arbitrary or malicious | Corrupting bugs, compromise | Heavy: 3f+1 and signatures |

Most of microservice life is **crash-recovery + omission + timing + gray**. True Byzantine behaviour in your own fleet is almost always a *bug writing bad data*, which you fight with validation and containment rather than consensus protocols.

The Harbor incident was **gray**: the service was alive for most requests, so every binary health signal said "up."

## What actually takes systems down

In most post-incident reviews, the trigger is rarely a clean hardware death. It is typically one of:

1. **A change** (deploy, config flip, schema migration, expired certificate).
2. **Overload** (a traffic surge, a slow dependency, a retry storm).
3. **Correlated failure** (many "independent" copies sharing a hidden dependency).
4. **A recovery action that made things worse** (a failover, a restart wave, a replay).

Hold on to this list. It is why Part II spends its time on correlation, queues and feedback loops rather than on disk failure rates.

> [!WARNING]
> **Pitfall: "the health check is green."** A health check measures what *you chose to check*. Gray failures live precisely in what you did not. Judge health by what **callers experience**, not by what the callee reports about itself.

## Checkpoint

<details>
<summary>1. Name a fault, the error it causes, and the failure a user sees, for any incident you remember.</summary>

There is no single right answer; the test is whether you can separate the three. Example: *fault* = leaked connection in a retry path; *error* = pool at 100% with threads parked; *failure* = checkout times out. If you could not separate them, you probably fixed the symptom rather than the cause.

</details>

<details>
<summary>2. Which is more important to protect for "send the customer an order-confirmation email": safety or liveness?</summary>

It depends on the cost of each error. A *duplicate* email is mildly annoying (safety violation, cheap); a *missing* email may cause a support ticket (liveness violation, moderate). Most teams choose at-least-once delivery and accept the occasional duplicate. The point is that it is a *decision*.

</details>

<details>
<summary>3. Why is "the pod passes its probe" weak evidence that users are fine?</summary>

Probes check what the probe author thought of. Partial, per-path, per-tenant and per-dependency failures pass probes while real traffic fails. Only caller-side success and latency see them.

</details>

## Takeaways

- Failures climb a ladder: **fault → error → failure**. Design where you stop the climb.
- Separate **safety** from **liveness**; decide per invariant which you protect.
- Choose the **weakest defensible failure model**. Most of yours are crash-recovery, omission, timing and gray.
- Most outages come from **change, overload, correlation and recovery mistakes**, not from dead disks.

<div class="notebook">

<span class="tag">Tessera notebook · entry 1</span>

We start the **invariant register** that the whole book builds:

- **S1.** An order submitted with the same idempotency key has *at most one* effect.
- **S2.** An acknowledged order is *never lost*.
- **L1.** 99% of acknowledged orders reach dispatch within 60 seconds.
- **L2.** The ingest API answers 99.95% of requests with p99 under 500 ms.

Notice that S1 and S2 are safety rules; L1 and L2 are liveness targets. When the system is under stress, S1 and S2 win.

</div>

**Next:** you cannot even *tell* whether an order arrived. [The Physics You Cannot Escape](ch02-the-physics.md).
