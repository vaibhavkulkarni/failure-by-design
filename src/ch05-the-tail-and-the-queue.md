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

<div class="derivation">

<span class="tag">Derivation · the tail at scale</span>

**Question.** One call is slow (beyond some threshold \\( T \\)) with probability \\( p \\). A request fans out to \\( n \\) calls in parallel and is slow if *any* is. How often is the request slow?

**Assumptions.** Calls are slow independently, and each has the same \\( p \\).

**Derivation.**

1. One call is *not* slow with probability \\( 1-p \\).
2. All \\( n \\) calls are not slow: independent, so multiply, \\( (1-p)^{n} \\).
3. The request is slow if that does not happen:

\\[ P(\text{slow}) = 1 - (1-p)^{n} \\]

4. *A simpler form.* For small \\( p \\), \\( \ln(1-p) = -p - p^2/2 - \cdots \approx -p \\). Then \\( (1-p)^n = e^{\\,n\ln(1-p)} \approx e^{-np} \\), so

\\[ P(\text{slow}) \approx 1 - e^{-np} \\]

5. *Working backwards.* To keep the whole request slow at most \\( P \\) of the time, solve \\( (1-p)^n = 1-P \\): \\( p = 1-(1-P)^{1/n} \\). Using the same approximation \\( (1-P)^{1/n} \approx 1 - P/n \\), the leaf budget is about \\( p \approx P/n \\).
6. *Hedging.* If a second request is sent after a delay and its slowness is independent, both are slow with probability \\( p \times p = p^2 \\).

**Reading the result.** What matters is \\( n\\,p \\), the *expected number of slow calls per request*. When it reaches 1, most requests contain at least one:

| \\( np \\) | 0.1 | 0.5 | 1 | 2 | 3 |
|---|---|---|---|---|---|
| Requests hit by a slow call | 10% | 39% | **63%** | 86% | 95% |

With \\( p = 1\% \\) and \\( n = 100 \\): \\( 1-0.99^{100} = 63.4\% \\). **At scale, a leaf's p99 becomes the aggregate's median.**

**Where it breaks.** Real slowness is *clustered* (same overloaded server, same GC cycle): the chance of *any* slow call is then lower than the formula, but when it happens many calls are slow together. And a hedge sent to the same struggling dependency adds load instead of cutting the tail.

</div>

<div class="widget" data-widget="fanout"></div>

Two practical rules follow:

- **Work backwards.** Set the SLO on the composite, then derive the leaf budget \\( p \approx P/n \\).
- **Serial depth adds latency; parallel width adds tail risk.** They need different fixes.

## Little's Law: the one equation for pools

<div class="derivation">

<span class="tag">Derivation · Little's Law</span>

**Question.** How many requests are inside a system at once, given how fast they arrive and how long each stays?

**Assumptions.** The system is stable (it does not accumulate a growing backlog) and we watch for a long time \\( T \\) compared with a single stay. *Nothing is assumed about the arrival pattern, the service times or the order of service.*

**Derivation.**

1. Let \\( A(t) \\) be the number of arrivals so far and \\( D(t) \\) the number of departures. The number inside at time \\( t \\) is the gap \\( N(t) = A(t) - D(t) \\).

```text
count
  │             ┌─────────  A(t)  cumulative arrivals
  │         ┌───┘  ░░░░░░
  │     ┌───┘  ░░░░░░░░░░    the shaded gap is N(t)
  │  ┌──┘   ┌─────────────  D(t)  cumulative departures
  └──┴──────┴──────────────► time
```

2. The shaded area between the two curves over \\( [0, T] \\) is \\( \int N(t)\\,dt \\).
3. Count that same area a second way: it is the sum, over every request, of the time that request spent inside. About \\( \lambda T \\) requests passed through, each staying \\( W \\) on average, so the area is \\( \lambda T \cdot W \\).
4. The *average* number inside is area ÷ \\( T \\):

\\[ L = \lambda\\,W \\]

**Reading the result.** Coffee shop: 2 customers arrive per minute and each stays 5 minutes, so there are 10 inside. Units check: (per minute) × (minutes) = a count. It works for any "box": a thread pool, a queue, a cluster, a connection pool.

*Worked number.* \\( \lambda = 500 \\)/s and \\( W = 40 \\) ms gives \\( L = 20 \\) in flight. If the dependency slows so that \\( W = 2 \\) s, \\( L = 1000 \\): your arrival rate did not move, but the number of *seats you need* rose fifty-fold.

**Where it breaks.** If the system is unstable (backlog growing) or the window is short relative to a stay, the area argument has large edge effects. Otherwise it is remarkably robust.

</div>

<div class="widget" data-widget="little"></div>

Drag **W** upward and watch the bar overflow even though traffic is flat. That overflow *is* the outage: a pool of 200 cannot serve 1000 concurrent needs, the remainder queue, which makes \\( W \\) larger, which makes the need larger still.

The fix is derived, not memorised: give each dependency its *own* concurrency cap, sized so that **even if that dependency stalls completely, the cap cannot consume more than its share of your capacity**. (You have just derived the bulkhead.)

## The curve: latency near saturation

Why does latency explode as utilisation approaches 100%? We derive it for the simplest queue, then see what changes in reality.

<div class="derivation">

<span class="tag">Derivation · the M/M/1 queue</span>

**Question.** One server; requests arrive at random at rate \\( \lambda \\); each takes a random time with average \\( 1/\mu \\). How long does a request spend in the system?

**Assumptions.** (a) Arrivals are random and memoryless (Poisson). (b) Service times are exponential. (c) One server, first come first served, unlimited queue. (d) \\( \rho = \lambda/\mu < 1 \\), otherwise the queue grows forever.

**Derivation.**

1. Let \\( \pi_n \\) be the long-run fraction of time with exactly \\( n \\) requests in the system.
2. *Balance.* In steady state the rate of moving from \\( n \\) to \\( n+1 \\) must equal the rate of moving back, or the system would drift. Going up happens at rate \\( \lambda \\) (an arrival) when in state \\( n \\); going down at rate \\( \mu \\) (a completion) when in state \\( n+1 \\): \\( \pi_n\lambda = \pi_{n+1}\mu \\).
3. So \\( \pi_{n+1} = \rho\\,\pi_n \\), and therefore \\( \pi_n = \rho^{\\,n}\pi_0 \\): **each extra request in the system is \\( \rho \\) times as likely as the one before.**
4. *Normalise.* The \\( \pi_n \\) must sum to 1. Using the geometric series \\( \sum_{n\ge0}\rho^n = \dfrac{1}{1-\rho} \\): \\( \pi_0 = 1-\rho \\). (This also says the server is idle a fraction \\( 1-\rho \\) of the time, as it should be.)
5. *Average number in system.* \\( L = \sum_n n\\,\pi_n = (1-\rho)\sum_n n\rho^n \\). Differentiate the geometric series: \\( \sum_n n\rho^{n-1} = \dfrac{1}{(1-\rho)^2} \\), so \\( \sum_n n\rho^n = \dfrac{\rho}{(1-\rho)^2} \\). Hence

\\[ L = \frac{\rho}{1-\rho} \\]

6. *Convert to time with Little's Law.* \\( W = L/\lambda = \dfrac{\rho}{\lambda(1-\rho)} = \dfrac{1}{\mu(1-\rho)} \\), i.e.

\\[ W = \frac{1/\mu}{1-\rho} = \frac{1}{\mu-\lambda} \\]

**Reading the result.** \\( 1/\mu \\) is the service time. Reinterpret \\( 1-\rho \\) as **spare capacity**: arrivals come in random clumps, and spare capacity is what digs you out of each clump. Halve the spare and each clump takes twice as long to clear:

| Spare capacity \\( 1-\rho \\) | 50% | 25% | 12.5% | 6.25% |
|---|---|---|---|---|
| Time in system ÷ service time | 2× | 4× | 8× | 16× |

**Where it breaks.** Real arrivals are burstier and real service times more variable than exponential. A well-known approximation by Kingman (stated here, not derived) captures it:

\\[ \text{wait in queue} \approx \frac{\rho}{1-\rho}\cdot\frac{c_a^2 + c_s^2}{2}\cdot\tau \\]

where \\( c_a, c_s \\) are the coefficients of variation (standard deviation ÷ mean) of inter-arrival and service times, and \\( \tau \\) is the mean service time. With exponential times \\( c = 1 \\) and it reduces to our result (check: \\( W = \tau + \frac{\rho}{1-\rho}\tau = \frac{\tau}{1-\rho} \\)). It reveals two levers: **add spare capacity**, or **make work more uniform** (cap request sizes, batch evenly). Halving the variability quarters that factor.

</div>

<div class="widget" data-widget="queue"></div>

At \\( \rho = 0.5 \\) a request takes 2× its service time; at 0.9, 10×; at 0.99, 100×. A fleet "efficiently" run at 90% has no room for a surge, a failed node or a GC pause.

### Capacity when something is missing (N+k)

<div class="derivation">

<span class="tag">Derivation · headroom for losing a unit</span>

1. \\( n \\) identical units each serve \\( \mu \\); total offered load is \\( \lambda_{\text{peak}} \\), shared equally. Normal utilisation: \\( \rho_0 = \lambda_{\text{peak}}/(n\mu) \\).
2. Lose \\( f \\) units. The remaining \\( n-f \\) share the same load, so each carries \\( \lambda_{\text{peak}}/(n-f) \\) and utilisation becomes \\( \lambda_{\text{peak}}/\big((n-f)\mu\big) \\).
3. Require that to stay at or below your ceiling \\( \rho_{\max} \\): \\( (n-f)\\,\mu\\,\rho_{\max} \ge \lambda_{\text{peak}} \\).
4. Equivalent view: utilisation is multiplied by \\( n/(n-f) \\), so the *steady-state* ceiling is \\( \rho_0 \le \rho_{\max}\\,(n-f)/n \\).

*Worked number.* Three clusters, lose one, ceiling 0.8: load per survivor rises \\( 3/2 = 1.5\times \\), so \\( \rho_0 \le 0.8/1.5 \approx 0.53 \\). Three clusters each at 70% are not fault tolerant; they are a cascading failure with a delay.

</div>

## Recovery has its own capacity requirement

<div class="derivation">

<span class="tag">Derivation · how long to drain a backlog</span>

**Assumptions.** A fluid approximation: ignore randomness, treat work as a continuous flow.

1. During an outage or pause of length \\( T \\), arrivals keep coming at \\( \lambda \\) but nothing completes, so a backlog \\( B = \lambda T \\) builds up.
2. When service resumes, the server completes work at \\( \mu \\) but new work still arrives at \\( \lambda \\). The backlog shrinks at the **difference**, \\( \mu - \lambda \\).
3. Time to clear = backlog ÷ shrink rate:

\\[ T_{\text{drain}} = \frac{\lambda T}{\mu-\lambda} = T\\,\frac{\rho}{1-\rho} \\]

(divide numerator and denominator by \\( \mu \\) for the last form).

**Reading the result.** *Recovery speed is spare capacity.* The outage plugs the drain of a bathtub while the tap runs; afterwards the drain only gains on the tap by the spare amount. At \\( \rho = 0.9 \\) the spare is a tenth of the load, so catching up takes nine times as long as the outage did. A 30-second pause at \\( \rho = 0.8 \\) needs two minutes; at 0.95, nine and a half. As \\( \rho \to 1 \\), the backlog **never** clears.

</div>

<div class="widget" data-widget="drain"></div>

Headroom for *recovery* is a separate requirement from headroom for *peak*.

## Refuse early, refuse cheaply

Past the knee, more offered work does not yield more finished work. Timeouts waste effort, contexts thrash, GC runs hot, and **goodput falls**. The best policy for overload is therefore to **admit only what you can finish and reject the rest immediately**, with an explicit "try later". Load shedding is not a hack; it is the policy that maximises goodput under overload. Shed by priority so the most valuable work survives.

## Deadlines, not timeouts

A timeout says "wait this long." A **deadline** says "the caller gives up at time \\( D \\)" and is passed downstream. Why must the budget add up?

<div class="derivation">

<span class="tag">Derivation · the deadline budget</span>

1. On a serial path, a call to hop \\( i \\) can take at most \\( a_i \\) attempts, each lasting up to its timeout \\( t_i \\), with waits \\( b_i \\) between attempts. Its worst case is \\( a_i t_i + b_i \\).
2. Hops run one after another, so worst-case times add. The caller's total deadline must cover the sum, or the caller gives up while work continues:

\\[ D \ge \sum_i \big( a_i\\,t_i + b_i \big) \\]

3. Consequence: a downstream call that outlives the caller's *remaining* deadline is pure waste. The answer cannot be used, yet the capacity is still burned. So pass the remaining time down and never exceed it.

</div>

> [!WARNING]
> **Pitfall: the unbounded queue.** It converts overload into latency without bound, and then into memory exhaustion. Every queue, pool and buffer needs an explicit bound *and* a defined overflow action (reject, shed, or block with timeout).

<div class="rules">

<span class="tag">Rules of thumb</span>

1. **\\( np \approx 1 \\) means most requests are hit.** Keep fan-out times leaf tail-probability well below 1.
2. **\\( L = \lambda W \\):** whenever latency rises, the concurrency you need rises in proportion.
3. **Halve the spare capacity, double the latency.** Never plan to run hot.
4. **Drain time = outage × (load ÷ spare).** No spare, no recovery.
5. Lose one of \\( n \\) and survivors carry \\( n/(n-1) \\): **3 clusters → 1.5×, 4 → 1.33×**.

</div>

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
