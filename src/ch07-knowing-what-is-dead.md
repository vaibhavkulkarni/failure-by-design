# Knowing What Is Dead

<div class="coldopen">

<span class="tag">Cold open · fictional on-call log</span>

```
03:10:00  outbox-relay leader (pod relay-0) acquires lease L=30s, token 41.
03:10:12  relay-0 hits a 28-second stop-the-world GC pause.
03:10:30  lease expires. relay-1 acquires lease, token 42. Begins publishing.
03:10:40  relay-0 wakes. Its code says: "I hold the lease." Resumes publishing.
03:10:40  Two relays now publish the same outbox rows. Dispatch sees duplicates.
03:11:00  Nobody was down. Both leaders were "correct" about themselves.
```

</div>

The previous chapters said you cannot tell slow from dead. This chapter turns that into design: how to *decide* anyway, and how to stay safe when your decision is wrong.

## Failure detectors: two properties that fight

A detector suspects processes of having failed. We want:

- **Completeness**: every crashed process is eventually suspected.
- **Accuracy**: processes that are fine are not suspected.

With a fixed timeout \\( T \\) and a latency distribution with CDF \\( F \\), each check falsely suspects a healthy process with probability \\( 1 - F(T) \\), and detection takes at least \\( T \\). **Fast detection and few false alarms cannot both be had when the latency tail is heavy.** Moving \\( T \\) only slides you along the trade-off.

Two ideas make this workable.

### 1. Adaptive detection (φ-accrual)

Instead of a yes/no, output a continuous suspicion level, based on how unusual the silence is given the history of arrival gaps:

\\[ \varphi(t) = -\log_{10} P\big(\text{heartbeat still arrives later than } t\big) \\]

\\( \varphi = 1 \\) means "10% chance this is just slow"; \\( \varphi = 3 \\), "0.1%." Each consumer picks its own threshold.

### 2. Match the action to the cost of being wrong

| Action | Cost if the suspicion is wrong | Threshold |
|---|---|---|
| Stop sending *new* requests to a replica | Small, reversible | Aggressive |
| Restart a pod | Moderate | Moderate |
| Promote a new primary of stateful data | Potentially severe (split brain) | Conservative, **and fenced** |

## Gray failure: detect from the caller's side

A node can pass every self-check while real requests fail. The signature is **differential observability**: the callee says "healthy" while callers see errors and latency. So:

- Measure success and latency **per caller, per dependency, per path**.
- Compare the callee's self-report with callers' experience; disagreement is the alarm.
- Prefer *outlier ejection* by observed behaviour (many callers saw failures from this endpoint) over self-reported health.

The Harbor incident in Chapter 1 was exactly this: one of three upstream IPs was bad, and only the client-side view of connection outcomes showed it.

## Quorums: agreeing despite failures

To keep agreeing when up to \\( f \\) nodes **crash**, you need \\( n \ge 2f+1 \\). To tolerate \\( f \\) **Byzantine** nodes, \\( n \ge 3f+1 \\). For reads and writes over \\( N \\) replicas with read quorum \\( R \\) and write quorum \\( W \\):

\\[ R + W > N \\]

guarantees every read overlaps the latest write.

Two facts to carry:

1. **Three fault domains tolerate exactly one failure** with a majority. Two domains tolerate *none*: a partition leaves each side unsure whether the other is dead. So Tessera's three clusters give it one independent failure, not "three nines of everything."
2. A quorum operation's latency is the **\\( k \\)-th fastest** replica, not the mean. Quorums have good tails (they ignore the slowest \\( n-k \\)), but cross-region quorums pay a wide-area round trip on every write.

## Time, leases, and fencing

Clocks drift, processes pause for arbitrary lengths (GC, throttling, VM migration), and messages arrive late. So:

> [!IMPORTANT]
> **Never use wall-clock comparison across machines to establish safety.** Use clocks for *liveness* (timeouts) and something else for *correctness*.

A **lease** gives a node exclusive rights for duration \\( L \\). The holder must stop acting at

\\[ t_{\text{acquire}} + L - \varepsilon_{\text{drift}} - t_{\text{pause}}^{\max} \\]

but \\( t_{\text{pause}}^{\max} \\) is unbounded in a garbage-collected runtime, as the cold open showed. So a lease can only ever be a *liveness hint*.

**Fencing tokens** make it safe. Each acquisition returns a strictly increasing token. The *resource being protected* remembers the highest token it has seen and **rejects any request carrying a lower one**:

```
relay-0 (token 41)  ──publish──►  store: highest seen 42  ──► REJECTED (41 < 42)
relay-1 (token 42)  ──publish──►  store: highest seen 42  ──► accepted
```

This converts "I believe I am the leader" (unsafe) into "the storage layer enforces who is the leader" (safe). If a resource cannot check a token, it cannot be protected by a lease, whatever the lease's length.

### Last-writer-wins is a trap

Resolving conflicts by comparing timestamps silently discards data under clock skew and concurrent writes. Use it only when losing a concurrent update is explicitly acceptable, or when each entity has a single writer by construction. Otherwise use version numbers and compare-and-set, or version vectors.

## Checkpoint

<details>
<summary>1. Why can lengthening a lease not make it safe?</summary>

Because the holder's pause has no upper bound. Any finite lease can expire during a pause, after which the holder resumes believing it is still valid. Safety needs a *check at the resource*, which is what a fencing token provides.

</details>

<details>
<summary>2. With 5 replicas, how many can crash before a majority is lost? What are sensible R and W?</summary>

A majority is 3, so up to 2 may crash. A symmetric choice is \\( R = W = 3 \\), satisfying \\( R+W = 6 > 5 \\). For read-heavy workloads you might pick \\( R=2, W=4 \\) (still 6 > 5).

</details>

<details>
<summary>3. Which signal tells you most reliably about a gray failure?</summary>

A difference between what the component reports about itself and what its callers measure, per path and per caller. For example: callee health 100%, caller-observed error rate 30% for one route.

</details>

## Takeaways

- Fast detection and accuracy trade against each other; make the **action proportional to the cost of being wrong**.
- **Observe from callers** to see gray failure.
- **Three domains tolerate one failure;** quorum latency is an order statistic.
- **Leases are hints; fencing tokens are safety.** Clocks are for liveness only.

<div class="notebook">

<span class="tag">Tessera notebook · entry 7</span>

**Single-active roles** (outbox relay, scheduler, migration runner) use a lease for efficiency *and* a fencing token checked by the datastore for safety.

**Health model.** Readiness removes a pod from rotation aggressively. *Liveness* never depends on downstream services. Ejection of a bad upstream endpoint is by caller-observed outcome, not self-report. Promotion of stateful roles requires fencing.

</div>

**Next:** unknown outcomes mean we will do things twice. How to make that safe. [Doing Things Twice](ch08-doing-things-twice.md).
