# Counting Nines

<div class="coldopen">

<span class="tag">Cold open · fictional design review</span>

```
Ines:   "Every service in the order path has a 99.9% SLO. So the path is 99.9%?"
You:    "...Yes?"
Ines:   "How many services does an order touch?"
You:    "Twenty."
Ines:   "Open a calculator. Type 0.999, then raise it to the twentieth power."
You:    "0.9802."
Ines:   "That's 174 hours of downtime a year. Not one of your teams missed its SLO."
```

</div>

Availability maths is simple. The surprise is how fast simple things compound. Let's build it from the ground up.

## Reliability and availability

Availability formulas look like decrees until you see where they come from. We will derive each one from a short list of assumptions, so you know exactly when you can trust it and when you cannot.

<div class="derivation">

<span class="tag">Derivation · how long does a component last?</span>

**Question.** If a component can fail at any moment, what is the probability it is still working at time \\( t \\)?

**Assumptions.**
(a) In any tiny interval of length \\( dt \\) the chance of failing is \\( \lambda\\,dt \\), with \\( \lambda \\) a constant *failure rate*.
(b) That chance does not depend on the past: a component that has run for a year is no more "due" than a new one (*memoryless*).

**Derivation.**

1. Let \\( R(t) \\) be the probability of surviving to time \\( t \\). To survive to \\( t+dt \\) you must survive to \\( t \\) *and then* survive one more tick. By assumption (b) these multiply: \\( R(t+dt) = R(t)\\,(1-\lambda\\,dt) \\).
2. Rearrange: \\( \dfrac{R(t+dt)-R(t)}{dt} = -\lambda R(t) \\). As \\( dt \to 0 \\) the left side is the derivative, so \\( \dfrac{dR}{dt} = -\lambda R \\). In words: *the rate of decline is proportional to what is still alive*.
3. The function whose derivative is a constant multiple of itself is the exponential. Check: \\( R(t) = e^{-\lambda t} \\) gives \\( dR/dt = -\lambda e^{-\lambda t} = -\lambda R \\), and \\( R(0) = 1 \\) as required.
4. **Average lifetime (MTBF).** The mean of a non-negative lifetime equals the area under its survival curve:

\\[ \text{MTBF} = \int_0^{\infty} R(t)\\,dt = \int_0^{\infty} e^{-\lambda t}\\,dt = \frac{1}{\lambda} \\]

**Reading the result.** \\( \lambda = 1/\text{MTBF} \\). A part that fails once every two years has \\( \lambda = 0.5 \\) per year, and the chance it survives one year is \\( e^{-0.5} \approx 61\% \\). Notice that the chance of surviving one *full* MTBF is only \\( e^{-1} \approx 37\% \\). MTBF is an average, not a guarantee.

**Where it breaks.** Real hardware and software are not memoryless. New releases fail early (*infant mortality*); old processes wear out (leaks, fragmentation, expiring certificates). Treat constant \\( \lambda \\) as a first approximation and expect change events to dominate it.

</div>

<div class="derivation">

<span class="tag">Derivation · availability</span>

**Question.** Over a long time, what fraction of the time is the component working?

**Assumptions.** The component alternates between working stretches averaging MTBF and repair stretches averaging MTTR.

**Derivation.**

1. Picture a long period \\( T \\) as repeated cycles of "up, then down":

```text
 ── up ─────────────┐ down ┌── up ──────────┐ down ┌── up ──────
      (about MTBF)   └ MTTR ┘   (about MTBF)  └ MTTR ┘
```

2. One cycle lasts \\( \text{MTBF}+\text{MTTR} \\) on average, so there are about \\( T/(\text{MTBF}+\text{MTTR}) \\) cycles.
3. Each cycle contributes \\( \text{MTBF} \\) of up-time, so total up-time is \\( T\cdot \text{MTBF}/(\text{MTBF}+\text{MTTR}) \\).
4. Divide by \\( T \\):

\\[ A = \frac{\text{MTBF}}{\text{MTBF}+\text{MTTR}} \\]

5. Substitute \\( \text{MTBF} = 1/\lambda \\) and multiply top and bottom by \\( \lambda \\): \\( A = \dfrac{1}{1+\lambda\\,\text{MTTR}} \\).
6. Write \\( x = \lambda\\,\text{MTTR} \\). For small \\( x \\), the geometric series gives \\( \dfrac{1}{1+x} = 1 - x + x^2 - \cdots \approx 1-x \\), and the dropped term \\( x^2 \\) is a millionth when \\( x = 0.001 \\). Hence

\\[ U = 1 - A \approx \lambda\\,\text{MTTR} \\]

**Reading the result.** *Failures per year* times *minutes per failure* equals *minutes of downtime per year*. The units alone tell you it must be right. It also tells you there are two levers, \\( \lambda \\) and MTTR, and that halving either is worth the same. Recovery speed is usually the cheaper lever: faster detection, automated rollback, smaller blast radius.

*Worked number.* Twelve incidents a year, thirty minutes each, is six hours: \\( U \approx 6/8766 \approx 0.068\% \\), so \\( A \approx 99.93\% \\).

**Where it breaks.** It treats failure as an on/off event with a repair. Slow degradation, partial failure and brownouts do not fit, and averages hide the *shape* of downtime (see the warning at the end of this chapter).

</div>

### How big is a nine?

Nines are logarithmic: each additional nine cuts downtime tenfold. Anchor on three landmarks: three nines is about **9 hours a year**, four nines about **an hour**, five nines about **five minutes**.

<div class="widget" data-widget="downtime"></div>

The "incident" line is the real conversation behind an SLO: three nines allows about seventeen 30-minute incidents a year; four nines fewer than two. *How many bad half-hours can we afford?*

## Series: when everything must work

<div class="derivation">

<span class="tag">Derivation · hops in series</span>

**Question.** A request must pass through hops \\( 1, 2, \dots, n \\), and hop \\( i \\) is available with probability \\( A_i \\). What is the chance the request succeeds?

**Assumptions.** (a) The request fails if *any* hop fails. (b) Hops fail independently.

**Derivation.**

1. The request succeeds exactly when hop 1 works **and** hop 2 works **and** … hop \\( n \\) works.
2. For independent events, "and" means multiply (that is what independence *means*: \\( P(X \text{ and } Y) = P(X)P(Y) \\)). So

\\[ A_{\text{chain}} = A_1 \cdot A_2 \cdots A_n \\]

3. To see what this does to *downtime*, write \\( A_i = 1 - U_i \\). For two hops, \\( (1-U_1)(1-U_2) = 1 - U_1 - U_2 + U_1U_2 \\). For \\( n \\) hops, expanding gives 1, minus every \\( U_i \\), plus every product of two \\( U \\)'s, minus every product of three, and so on.
4. When each \\( U_i \\) is small (say \\( 10^{-3} \\)), the product terms are a thousand times smaller than the single terms. Dropping them:

\\[ A_{\text{chain}} \approx 1 - \sum_i U_i \qquad\Longrightarrow\qquad U_{\text{chain}} \approx \sum_i U_i \\]

**Reading the result.** *In series, downtimes add.* Every hard dependency is a tax on your downtime, and the taxes are paid by the same request. Twenty hops at \\( U = 0.001 \\): \\( U \approx 0.020 \\), so about 98% (exactly \\( 0.999^{20} = 0.9802 \\)), or about 174 hours of downtime a year.

**Where it breaks.** (a) Failures are rarely independent (Chapter 4). (b) A hop that can be retried or skipped is not a pure series element. (c) Different request types take different paths, so compute availability *per user journey*, not once for the whole system.

</div>

Each dot below is a request. It survives only if it passes **every** gate.

<div class="widget" data-widget="dots"></div>

Raise the hops and the red dots multiply roughly in proportion (that is the "downtimes add" result). Raise the nines and they thin out tenfold per nine.

The design consequences are bigger than any hardening you do per service:

1. **Cut hops.** Every hard synchronous dependency you remove is a free multiplier.
2. **Demote dependencies.** Turn *hard* into *soft* (can degrade) or *async* (can wait).
3. **Your SLO ceiling is the product of your hard dependencies' availability.** A vendor's 99.9% means you cannot honestly promise 99.95%.

## Parallel: when any one suffices

<div class="derivation">

<span class="tag">Derivation · redundant copies</span>

**Question.** With \\( m \\) replicas, any one of which is enough, what is the chance the system is down?

**Assumptions.** (a) Switching between replicas is instant. (b) Replicas fail independently. (c) One replica can carry the load.

**Derivation.**

1. The system is down exactly when **all** replicas are down at the same moment.
2. Replica \\( i \\) is down with probability \\( U_i = 1 - A_i \\). Independent events multiply:

\\[ U_{\text{sys}} = U_1 \cdot U_2 \cdots U_m \qquad A_{\text{sys}} = 1 - \prod_i U_i \\]

**Reading the result.** *In parallel, unavailabilities multiply.* Two 1% replicas: \\( 0.01 \times 0.01 = 0.0001 \\), a hundredfold gain for one extra box. Each additional replica multiplies by *another* \\( U \\).

**Where it breaks.** Assumption (b) carries the entire argument. If one replica's failure makes another likelier (same release, same dependency, same rack), the product is wrong, and wrong in the optimistic direction. Chapter 4 is entirely about that. Assumption (a) also bites: detection and switchover take time, and that time counts as downtime for requests in flight.

</div>

## k-of-n: quorums and capacity

Often you need *at least* \\( k \\) of \\( n \\) units: a majority for agreement, or enough capacity for peak load.

<div class="derivation">

<span class="tag">Derivation · at least k of n</span>

**Question.** Each of \\( n \\) units is up with probability \\( a \\), independently. What is the chance at least \\( k \\) are up?

**Derivation.**

1. Fix one particular set of \\( i \\) units. The chance that *exactly those* are up and the other \\( n-i \\) are down is \\( a^{i}(1-a)^{n-i} \\) (independence again: multiply).
2. How many such sets are there? Choose which \\( i \\) of \\( n \\) are up: pick in order, \\( n(n-1)\cdots(n-i+1) \\) ways, then divide by the \\( i! \\) orderings of the same set. That count is \\( \binom{n}{i} \\).
3. Different sets are mutually exclusive, so probabilities add. "At least \\( k \\)" means summing over \\( i = k, \dots, n \\):

\\[ A = \sum_{i=k}^{n} \binom{n}{i}\\, a^{i} (1-a)^{n-i} \\]

**Worked example: 2 of 3 clusters, \\( a = 0.999 \\).** List every state of the three units:

| Units up | Ways | Probability of each way | Counts as "working"? |
|---|---|---|---|
| 3 | 1 | \\( a^3 \\) | yes |
| 2 | 3 | \\( a^2(1-a) \\) | yes |
| 1 | 3 | \\( a(1-a)^2 \\) | no |
| 0 | 1 | \\( (1-a)^3 \\) | no |

\\[ A = a^3 + 3a^2(1-a) \approx 0.999997 \\]

**A shortcut for small \\( U \\).** The system fails when at least \\( f+1 \\) units are down, where \\( f = n-k \\) is how many you can lose. The most likely way to fail is *exactly* \\( f+1 \\) down, and there are \\( \binom{n}{f+1} \\) ways to choose them, each with probability about \\( U^{f+1} \\):

\\[ U_{\text{sys}} \approx \binom{n}{f+1}\\, U^{f+1} \\]

For 2-of-3 (\\( f = 1 \\)): \\( 3U^2 = 3\times10^{-6} \\), matching the exact answer. Each extra tolerated failure multiplies by another \\( U \\), at the price of a combinatorial count of ways to lose.

**Where it breaks.** Again independence; and units must be *identical* in capacity and failure behaviour for the binomial to apply.

</div>

## Utility: when "up or down" is the wrong question

Not every failure is binary. If the carrier-rate API is down and Tessera falls back to cached rates delivering a fraction \\( q = 0.8 \\) of full value, how much value do we deliver on average?

<div class="derivation">

<span class="tag">Derivation · expected value across states</span>

1. The dependency is up with probability \\( A_D \\) (value 1) and down with probability \\( 1-A_D \\) (value \\( q \\)).
2. The *expected* value of a random outcome is each outcome's value weighted by its probability:

\\[ E[\text{value}] = A_D \cdot 1 + (1-A_D)\cdot q \\]

3. With more states, add one term per state: \\( E = \sum_s P(s)\\,V(s) \\).

**Reading the result.** It forces a conversation engineers usually skip: *what is a degraded order actually worth?* That is a product decision, and the arithmetic makes it unavoidable.

</div>

> [!WARNING]
> **Common misreading: "99.9% means one request in a thousand fails."** Availability averages over the *shape* of failure. 8.8 hours a year could be one catastrophic outage or 526 one-minute blips; customers, contracts and on-call experience them very differently. Pair an availability target with limits on the **longest single outage** and on **errors within any short window**.

<div class="rules">

<span class="tag">Rules of thumb</span>

1. **Series: add the downtimes. Parallel: multiply the unavailabilities.**
2. One hard dependency at three nines costs about **9 hours a year**; twenty cost about 175.
3. Three nines ≈ seventeen 30-minute incidents a year. Four nines ≈ fewer than two.
4. **Halving MTTR is as good as halving the failure rate.**
5. Your availability can never exceed that of your weakest *hard* dependency.

</div>

## Checkpoint

<details>
<summary>1. A path has 8 hard dependencies at 99.95% each. Roughly what availability can you promise?</summary>

\\( 0.9995^8 \approx 0.9960 \\): about 99.6%. You cannot promise 99.95% on this path no matter how well your own service is run.

</details>

<details>
<summary>2. Your service fails 4 times a year and takes 45 minutes to recover. What is A? What if MTTR is cut to 15 minutes?</summary>

At 45 min: \\( U \approx 180/525960 \approx 0.034\% \\), \\( A \approx 99.966\% \\). At 15 min: \\( U \approx 60/525960 \approx 0.011\% \\), \\( A \approx 99.989\% \\). A threefold gain from recovery speed alone.

</details>

<details>
<summary>3. Why is converting a hard dependency to async often better than making it more reliable?</summary>

An async dependency leaves the synchronous path entirely, so it contributes no term to the series product. Reliability work reduces a term from, say, 0.999 to 0.9999; removal sets it to 1, and lets the dependency's downtime be absorbed by a queue.

</details>

## Takeaways

- Unavailability ≈ \\( \lambda \cdot \text{MTTR} \\): **recovery speed is a first-class lever.**
- **Series multiplies**, so hop count and hard-dependency count dominate.
- Parallel and k-of-n help, but only as far as failures are independent (next chapter).
- Model **utility per state**, not only up/down.

<div class="notebook">

<span class="tag">Tessera notebook · entry 3</span>

**Critical path (synchronous, hard):** global traffic manager → ingress/mesh → ingestion service → datastore write.
**Async or soft:** event log, billing, dispatch, notifications, carrier-rate pricing (falls back to cached tariff).

Draft budget with *illustrative* component numbers: 0.9999 × 0.9999 × 0.9999 × 0.99995 ≈ **0.99965**. That clears L2's 99.95% target, but only by a thin margin (about 79 minutes a year). Chapter 4 shows how fragile that margin is.

</div>

**Next:** the formulas above assumed independence. Reality does not. [When Failures Hold Hands](ch04-when-failures-hold-hands.md).
