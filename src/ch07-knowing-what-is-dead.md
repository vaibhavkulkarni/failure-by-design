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

A detector suspects processes of having failed. We want **completeness** (every crashed process is eventually suspected) and **accuracy** (healthy processes are not). Why can we not have both perfectly?

<div class="derivation">

<span class="tag">Derivation · the timeout trade-off</span>

**Question.** We suspect a node if no heartbeat arrives for \\( T \\). How often do we wrongly suspect a *healthy* node, and how long do we take to notice a *dead* one?

**Assumptions.** A healthy node's heartbeat gap \\( G \\) is random with cumulative distribution \\( F \\) (so \\( F(T) = P(G \le T) \\)).

**Derivation.**

1. A healthy node triggers a false alarm exactly when its gap exceeds \\( T \\): \\( P(\text{false alarm per check}) = P(G > T) = 1 - F(T) \\).
2. A crashed node sends nothing, and we only suspect it after waiting \\( T \\), so **detection time \\( \ge T \\)**.
3. Raising \\( T \\) lowers \\( 1-F(T) \\) (good) but raises the detection time (bad). Lowering \\( T \\) does the reverse. Moving \\( T \\) only slides you along one trade-off curve.

**Reading the result.** Suppose gaps are bell-shaped with mean 1000 ms and standard deviation 100 ms:

| Timeout \\( T \\) | 1100 ms | 1200 ms | 1300 ms | 1500 ms |
|---|---|---|---|---|
| False alarm chance | 16% | 2.3% | 0.13% | \\( 3\times10^{-7} \\) |

**Where it breaks.** If real gaps have a *heavy tail* (occasional pauses ten times longer, from GC, throttling, a congested link), \\( 1-F(T) \\) falls slowly as \\( T \\) grows, and no \\( T \\) is both fast and accurate. That is the core reason failure detection is hard.

</div>

### 1. Adaptive detection (φ-accrual)

A yes/no verdict wastes information. Instead, output a continuous *suspicion level*.

<div class="derivation">

<span class="tag">Derivation · why φ is a logarithm</span>

1. After silence of length \\( t \\), ask: *if the node were healthy, how likely is it that we would still be waiting?* That is \\( P_{\text{later}}(t) = 1 - F(t) \\), the same quantity as the false-alarm chance.
2. This number falls *multiplicatively* as silence grows: 16%, 2.3%, 0.13%, … We want a dial where equal steps feel equally more suspicious. Logarithms turn multiplication into addition, so define

\\[ \varphi(t) = -\log_{10} P_{\text{later}}(t) \\]

3. *Meaning:* \\( \varphi = 1 \\) says "a healthy node would still be silent 10% of the time"; \\( \varphi = 2 \\), 1%; \\( \varphi = 3 \\), 0.1%. **Each +1 is ten times less likely to be mere slowness.** It is a count of "nines of suspicion".
4. For bell-shaped gaps with mean \\( \mu \\) and standard deviation \\( \sigma \\), \\( P_{\text{later}}(t) = 1-\Phi\big((t-\mu)/\sigma\big) \\), where \\( \Phi \\) is the standard normal CDF. With \\( \mu = 1000 \\), \\( \sigma = 100 \\): 1200 ms of silence gives \\( \varphi \approx 1.6 \\); 1300 ms gives 2.9; 1500 ms gives 6.5.

**Where it breaks.** The bell-curve assumption understates tails, so treat φ as optimistic and prefer measured quantiles of real gaps.

</div>

<div class="widget" data-widget="phi"></div>

### 2. Match the action to the cost of being wrong

Because suspicion is a dial, each consumer can choose its own threshold according to what a wrong decision costs.

| Action | Cost if the suspicion is wrong | Threshold |
|---|---|---|
| Stop sending *new* requests to a replica | Small, reversible | Aggressive (low φ) |
| Restart a pod | Moderate | Moderate |
| Promote a new primary of stateful data | Potentially severe (split brain) | Conservative (high φ), **and fenced** |

## Gray failure: detect from the caller's side

A node can pass every self-check while real requests fail. The signature is **differential observability**: the callee says "healthy" while callers see errors and latency. So:

- Measure success and latency **per caller, per dependency, per path**.
- Compare the callee's self-report with callers' experience; disagreement is the alarm.
- Prefer *outlier ejection* by observed behaviour (many callers saw failures from this endpoint) over self-reported health.

The Harbor incident in Chapter 1 was exactly this: one of three upstream IPs was bad, and only the client-side view of connection outcomes showed it.

## Quorums: agreeing despite failures

<div class="derivation">

<span class="tag">Derivation · why quorums work, and why 2f+1 and 3f+1</span>

**Overlap.** Take any two groups \\( A \\) and \\( B \\) chosen from \\( N \\) replicas.

1. Their union cannot exceed everyone: \\( |A \cup B| = |A| + |B| - |A \cap B| \le N \\).
2. Rearranged: \\( |A \cap B| \ge |A| + |B| - N \\).
3. So if \\( |A| + |B| > N \\), the groups share **at least one** replica. With read quorum \\( R \\) and write quorum \\( W \\):

\\[ R + W > N \\]

guarantees every read meets a replica that saw the latest write. A *majority* is \\( \lfloor N/2 \rfloor + 1 \\); two majorities sum to at least \\( N+1 \\), so any two overlap. (Five seats: any 3 and any 3 is 6 seats' worth of people, so at least one is in both.)

**Why \\( 2f+1 \\) tolerates \\( f \\) crashes.** You need a majority among the replicas still alive. With \\( n = 2f+1 \\): majority is \\( f+1 \\), and \\( n - f = f+1 \\) survive. ✓. With \\( n = 2f \\): majority is \\( f+1 \\) but only \\( f \\) survive. ✗. So the minimum is \\( 2f+1 \\).

**Why \\( 3f+1 \\) tolerates \\( f \\) liars.** You can only wait for \\( n - f \\) replies (the other \\( f \\) may never come). Of those, up to \\( f \\) may be lies. For honest replies to outnumber lies: \\( (n-f) - f > f \\), so \\( n > 3f \\), i.e. \\( n \ge 3f+1 \\).

**Quorum latency.** Waiting for \\( k \\) replies means waiting for the \\( k \\)-th fastest of \\( n \\). The request is slow only if more than \\( n-k \\) replicas are slow, which is exactly the "at least \\( f+1 \\) down" calculation from Chapter 3. For 3 replicas, each slow 1% of the time, needing 2: slow with probability \\( \approx 3p^2 = 3\times10^{-4} \\). Quorums have good tails because they ignore the slowest \\( n-k \\) replicas, but cross-region quorums pay a wide-area round trip on every write.

</div>

Two consequences to carry:

1. **Three fault domains tolerate exactly one failure** with a majority (\\( 3 = 2\cdot1+1 \\)). Two domains tolerate *none*: a partition leaves each side unsure whether the other is dead. So Tessera's three clusters give it one independent failure, not "three nines of everything."
2. Quorum availability is a k-of-n calculation (Chapter 3) *with correlation* (Chapter 4). The binomial is the optimistic bound; β gives the realistic one.

## Time, leases, and fencing

Clocks drift, processes pause for arbitrary lengths (GC, throttling, VM migration), and messages arrive late. So:

> [!IMPORTANT]
> **Never use wall-clock comparison across machines to establish safety.** Use clocks for *liveness* (timeouts) and something else for *correctness*.

<div class="derivation">

<span class="tag">Derivation · why a lease cannot be safe, and why a fencing token is</span>

**Lease window.** A **lease** grants exclusive rights for duration \\( L \\), measured on the granter's clock from acquisition time \\( t_{\text{acq}} \\).

1. The holder's clock may differ from the granter's by up to \\( \varepsilon \\), so it must stop *early* by \\( \varepsilon \\).
2. The holder checks "am I still within my lease?" at some instant, then *acts* later. Between check and action it may be paused for up to \\( t_{\text{pause}}^{\max} \\). It must therefore stop acting at

\\[ t_{\text{acq}} + L - \varepsilon - t_{\text{pause}}^{\max} \\]

3. But in a garbage-collected or virtualised runtime \\( t_{\text{pause}}^{\max} \\) has **no finite bound**. So no finite \\( L \\) makes the lease safe by itself. The failure is **time-of-check versus time-of-use**: the check was true when made, false by the time it mattered. This is the cold open: a 28-second pause, an expired lease, a stale leader acting as if it still held it.

**Fencing token.** Move the check to the moment of use, and to something that cannot sleepwalk.

1. Each lease acquisition returns a **strictly increasing** number: 41, then 42, and so on.
2. The *resource* remembers the highest token \\( m \\) it has seen and accepts an operation only if its token is at least \\( m \\) (then sets \\( m \\) to that token).
3. *Safety argument.* Suppose the stale holder has token 41 and the new holder has 42. Once the new holder's first operation reaches the resource, \\( m \ge 42 \\), so any later operation carrying 41 is rejected. If the stale operation arrives *before* any token-42 operation, it simply executes earlier than the handover, which is harmless because the new holder has done nothing yet.

```text
relay-0 (token 41)  ──publish──►  store: highest seen 42  ──► REJECTED (41 < 42)
relay-1 (token 42)  ──publish──►  store: highest seen 42  ──► accepted
```

**Reading the result.** A bouncer who remembers the highest wristband number admitted does not care who thinks they are next. If a resource cannot check a token, it cannot be protected by a lease at all, whatever the lease's length.

</div>

### Last-writer-wins is a trap

Resolving conflicts by comparing timestamps silently discards data under clock skew and concurrent writes: if two writers' clocks differ by 700 ms, an update made *later* can carry an *earlier* timestamp and lose. Use it only when losing a concurrent update is explicitly acceptable, or when each entity has a single writer by construction. Otherwise use version numbers and compare-and-set, or version vectors.

<div class="rules">

<span class="tag">Rules of thumb</span>

1. **φ is "nines of suspicion".** Each point is ten times less likely to be ordinary slowness.
2. **Cheap, reversible action: low threshold. Expensive, irreversible action: high threshold, plus fencing.**
3. **Any two majorities overlap.** That is why quorums work.
4. **Three domains tolerate one failure; two tolerate none.**
5. **Never check at the actor; check at the resource.**

</div>

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
