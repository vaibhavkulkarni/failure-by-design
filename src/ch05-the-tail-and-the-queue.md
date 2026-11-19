# The Tail and the Queue

<div class="coldopen">

<span class="tag">Cold open · fictional on-call log</span>

```
16:40  carrier-rate API latency: 40 ms → 2 s (their incident, not ours).
16:41  Our traffic: unchanged. 500 req/s.
16:41  ingestion thread pool: 200 threads. Busy: 200. Queue: growing.
16:42  ingestion p50 latency: 9 s. Health probe times out. Pods marked NotReady.
16:43  Survivors take the traffic of the removed pods. They saturate too.
16:45  Orders that never touch the carrier API are failing as well.
```

</div>

Nothing in Tessera got slower except one dependency, and within five minutes everything was down. The explanation is two small laws and one curve.

## Latency is a distribution, and fan-out eats tails

A single call is slow with probability \\( p \\). A request that fans out to \\( n \\) parallel calls is slow if **any** of them is:

\\[ P(\text{slow}) = 1 - (1-p)^{n} \\]

<div class="widget" data-widget="fanout"></div>

With \\( p = 1\% \\) and \\( n = 100 \\) you get about 63%. **At scale, a leaf's p99 becomes the aggregate's median.** Two practical rules follow:

- **Work backwards.** Set the SLO on the composite, then derive the leaf budget: \\( p_{\text{leaf}} = 1 - (1 - P_{\text{target}})^{1/n} \\).
- **Serial depth adds latency; parallel width adds tail risk.** They need different fixes.

*Hedging*: if you send a second request after the p95 latency, and slowness is independent, both are slow with probability about \\( p^2 \\), for roughly 5% extra load. If slowness is *correlated* (the same overloaded server), the hedge adds load to the thing that is failing. Know which world you are in.

## Little's Law: the one equation for pools

For any stable system, with no assumptions about distributions:

\\[ L = \lambda \\, W \\]

**Concurrency = arrival rate × time in system.** That sizes every pool, semaphore and in-flight limit.

*Worked number.* At \\( \lambda = 500 \\) req/s and \\( W = 40 \\) ms, \\( L = 20 \\) concurrent requests. A 200-thread pool is ten times oversized, which feels safe. Now the carrier API degrades and \\( W \to 2 \\) s:

\\[ L = 500 \times 2 = 1000 \text{ concurrent requests needed} \\]

You have 200. The remainder queue, which makes \\( W \\) grow, which makes the demand for threads grow: a loop. **A pool size is not a tuning detail. It decides whether a slow dependency becomes your outage.**

The fix is derived, not memorised: give each dependency its *own* concurrency cap, sized so that **even if that dependency stalls completely, the cap cannot consume more than its share of your capacity**. (You have just derived the bulkhead.)

## The curve: latency near saturation

For a single-server queue with utilisation \\( \rho = \lambda/\mu \\) (arrival rate over service rate), the mean time in system is

\\[ W = \frac{1/\mu}{1 - \rho} \\]

<div class="widget" data-widget="queue"></div>

At \\( \rho = 0.5 \\) a request takes 2× its service time; at 0.9, 10×; at 0.99, 100×. Latency is **hyperbolic**. A fleet "efficiently" run at 90% has no room for a surge, a failed node or a GC pause. Multi-server queues soften the knee but keep its shape.

### Capacity when something is missing (N+k)

With \\( n \\) units, \\( f \\) of them lost, and a utilisation ceiling \\( \rho_{\max} \\):

\\[ (n - f)\\,\mu\\,\rho_{\max} \ge \lambda_{\text{peak}} \\]

Tessera runs three clusters. Lose one and the survivors carry 1.5× the load. To stay below \\( \rho = 0.8 \\) afterwards, steady-state \\( \rho \\) must be at most about **0.53**. Three clusters each running at 70% are not fault tolerant; they are a cascading failure with a delay. (Try it in the widget above.)

## Recovery has its own capacity requirement

After a pause or outage of length \\( T \\), a backlog of \\( \lambda T \\) accumulates. It drains at \\( \mu - \lambda \\):

\\[ T_{\text{drain}} = \frac{\lambda T}{\mu - \lambda} = T\\,\frac{\rho}{1-\rho} \\]

<div class="widget" data-widget="drain"></div>

A 30-second consumer pause at \\( \rho = 0.8 \\) needs two minutes to catch up. At \\( \rho = 0.95 \\), nine and a half. As \\( \rho \to 1 \\), the backlog **never** clears. Headroom for *recovery* is a separate requirement from headroom for *peak*.

## Refuse early, refuse cheaply

Past the knee, more offered work does not yield more finished work. Timeouts waste effort, contexts thrash, GC runs hot, and **goodput falls**. The best policy for overload is therefore to **admit only what you can finish and reject the rest immediately**, with an explicit "try later". Load shedding is not a hack; it is the policy that maximises goodput under overload. Shed by priority so the most valuable work survives.

## Deadlines, not timeouts

A timeout says "wait this long." A **deadline** says "the caller gives up at time T", and is passed downstream. Total deadline must cover the serial path with its retries:

\\[ D \ge \sum_i \big( a_i\\, t_i + b_i \big) \\]

(with \\( a_i \\) attempts, per-attempt timeout \\( t_i \\), and backoff \\( b_i \\)). A downstream call that outlives the caller's remaining deadline is pure waste: the answer cannot be used but the capacity is still burned.

> [!WARNING]
> **Pitfall: the unbounded queue.** It converts overload into latency without bound, and then into memory exhaustion. Every queue, pool and buffer needs an explicit bound *and* a defined overflow action (reject, shed, or block with timeout).

## Checkpoint

<details>
<summary>1. 800 req/s, each request holds a connection for 25 ms. How many connections are in use? What if the database slows to 500 ms?</summary>

\\( L = 800 \times 0.025 = 20 \\). At 500 ms: \\( 800 \times 0.5 = 400 \\). If the pool is 100, 300 requests are stuck waiting.

</details>

<details>
<summary>2. Why does a 4-cluster setup at 70% utilisation survive losing one while a 3-cluster one does not?</summary>

Losing one of four raises load to 4/3 = 1.33×, giving 0.93. Losing one of three gives 1.5× for 1.05, which is over capacity. (Neither is safe at 70% if the target is ρ ≤ 0.8: you would need ≤ 0.60 and ≤ 0.53.)

</details>

<details>
<summary>3. A consumer group stalls for 60 s at ρ = 0.9. How long to recover?</summary>

\\( 60 \times 0.9/0.1 = 540 \\) s, nine minutes, *if nothing else goes wrong*.

</details>

## Takeaways

- **Fan-out** converts leaf tails into aggregate medians: \\( 1-(1-p)^n \\).
- **Little's Law** sizes every pool; cap each dependency separately.
- **Latency is hyperbolic** near saturation; **N+k** and **recovery** headroom are separate requirements.
- Under overload, **reject early** and use **deadlines**, not bare timeouts.

<div class="notebook">

<span class="tag">Tessera notebook · entry 5</span>

**Concurrency caps (illustrative).** Carrier-rate calls: 300 req/s × 150 ms p99 = 45 in flight, so we cap at 60 and shed beyond that to the cached tariff. Datastore writes get their own pool. No pool is allowed to starve the others.

**Utilisation target.** Steady-state ρ ≤ 0.5 per cluster, so a lost cluster keeps survivors under 0.8 and recovery drains fast.

</div>

**Next:** what turns a short blip into a three-hour outage? [Feedback: How a Blip Becomes a Long Night](ch06-feedback.md).
