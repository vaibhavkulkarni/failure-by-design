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

Suppose a component fails at a constant rate \\( \lambda \\) (failures per unit time). The chance it survives to time \\( t \\) without failing is

\\[ R(t) = e^{-\lambda t} \\]

The average time between failures is \\( \text{MTBF} = 1/\lambda \\). When it fails, it takes on average \\( \text{MTTR} \\) to recover. The fraction of time it is *up* is its **availability**:

\\[ A = \frac{\text{MTBF}}{\text{MTBF} + \text{MTTR}} = \frac{1}{1 + \lambda\\,\text{MTTR}} \approx 1 - \lambda\\,\text{MTTR} \\]

That last form is the one to remember: **unavailability is failure frequency times recovery time.**

> [!TIP]
> Halving MTTR is worth exactly as much as halving the failure rate, and is usually far cheaper: faster detection, automated rollback, smaller blast radius, quicker restarts. Teams over-invest in "failing less" and under-invest in "recovering faster."

*Worked number.* Twelve incidents a year, thirty minutes each, is six hours of downtime: \\( U \approx 6/8766 \approx 0.068\% \\), so \\( A \approx 99.93\% \\).

Constant \\( \lambda \\) is a first approximation. New releases have **infant mortality**; long-lived processes **wear out** (leaks, fragmentation, expiring certificates). Change events usually dominate the real failure rate.

## Series: when everything must work

If a request needs every dependency on the path, availabilities **multiply**:

\\[ A_{\text{chain}} = A_1 \cdot A_2 \cdots A_n \\]

<div class="widget" data-widget="series"></div>

Try it: set 5 hops at three nines and you get about 99.5%. Set 20 and you are near 98%. Four nines per service at 20 hops still yields about 99.8%.

The design consequences are bigger than any hardening you do per service:

1. **Cut hops.** Every hard synchronous dependency you remove is a free multiplier.
2. **Demote dependencies.** Turn *hard* into *soft* (can degrade) or *async* (can wait). Section 5 returns to this.
3. **Your SLO ceiling is the product of your hard dependencies' availability**, minus your own. A vendor's 99.9% means you cannot honestly promise 99.95%.

## Parallel: when any one suffices

If you have \\( m \\) independent replicas and any one is enough:

\\[ A = 1 - \prod_{i=1}^{m} (1 - A_i) \\]

Two independent 99% replicas give 99.99%; three give 99.9999%. This is the formula behind every "just add replicas" argument, and the next chapter explains why it overpromises.

## k-of-n: quorums and capacity

Often you need *at least* \\( k \\) of \\( n \\) to work (a majority, or enough capacity for peak load):

\\[ A = \sum_{i=k}^{n} \binom{n}{i}\\, a^{i} (1-a)^{n-i} \\]

For Tessera's three clusters, needing two, with \\( a = 99.9\% \\) each:

\\[ A = 3a^2(1-a) + a^3 \approx 0.999997 \\]

That is roughly \\( 3(1-a)^2 = 3\times10^{-6} \\) unavailability, about 1.6 minutes a year, *if failures are independent*. Hold that thought.

## Utility: when "up or down" is the wrong question

Not every failure is binary. If the carrier-rate API is down and Tessera falls back to cached rates (quality \\( q = 0.8 \\) of full value), the expected value delivered is

\\[ E[U] = A_{D} \cdot 1 + (1 - A_{D}) \cdot q \\]

Modelling **utility** per state forces a conversation that engineers usually skip: *what is a degraded order actually worth?* That is a product decision, and the maths just makes it unavoidable.

> [!WARNING]
> **Pitfall: averaging nines.** Availability is multiplicative along a path but you cannot average SLOs across services to get a user-journey SLO. Compute it along the *path a request takes*, per journey.

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
