# Budgets, Risk, and Priorities

<div class="coldopen">

<span class="tag">Cold open · fictional planning meeting</span>

```
Backlog: 41 reliability ideas. Capacity this quarter: 6.
  - multi-region database failover drills
  - add a fourth cluster
  - retry budget in the SDK
  - rewrite the carrier client in a different language
  - rotate every certificate automatically
  ...
Ines: "Which five do we skip, and how do you know?"
```

</div>

Part II gave you ways to *compute* failure. This chapter turns the computation into **decisions**: how much reliability is enough, what to fix first, and how to know whether you are on track.

## SLOs, error budgets, burn rate

<div class="derivation">

<span class="tag">Derivation · budget, burn rate, and alert thresholds</span>

**Budget.** A service level objective (SLO) is the fraction of events (or time) that must be good. The remainder is what you may spend on failure.

1. Allowed bad fraction \\( = 1 - \text{SLO} \\).
2. Over a window of length \\( W \\): \\( \text{budget} = (1-\text{SLO}) \times W \\).
3. *Worked number:* 99.9% over 30 days: \\( 0.001 \times 30 \times 1440 = 43.2 \\) minutes of full outage.

**Burn rate.** *How fast are we spending, relative to the allowed pace?*

1. Let \\( e \\) be the current error rate (fraction of events failing). Over time \\( t \\), the failures incurred are proportional to \\( e\\,t \\).
2. The *share of the whole budget* consumed is that divided by the allowed amount \\( (1-\text{SLO})\\,W \\):

\\[ \text{share} = \frac{e\\,t}{(1-\text{SLO})\\,W} = \frac{e}{1-\text{SLO}}\\;\cdot\\;\frac{t}{W} \\]

3. Name the first factor the **burn rate**: \\( \text{burn} = \dfrac{e}{1-\text{SLO}} \\), the error rate divided by the error rate you can afford. Then \\( \text{share} = \text{burn} \times t/W \\).
4. Set \\( \text{share} = 1 \\) to find when the budget runs out: \\( t = W/\text{burn} \\).

**Reading the result.** An error budget is like a monthly data allowance and burn rate is how fast you are spending relative to an even pace. For a 30-day (720-hour) window:

| Burn rate | Budget lasts | Feels like |
|---|---|---|
| 1× | 30 days | on plan |
| 2× | 15 days | worth a ticket |
| 6× | 5 days | worth a same-day look |
| 14.4× | 50 hours | wake someone |
| 36× | 20 hours | all hands |
| 720× | 1 hour | total outage |

**Where alert thresholds come from.** Decide what share \\( s \\) of the *whole* budget you will lose before a human is told, and over what alert window \\( t \\). Rearranging \\( s = \text{burn}\times t/W \\) gives \\( \text{burn} = s\\,W/t \\):

| Tolerate losing | Alert window | Burn rate | Typical pairing |
|---|---|---|---|
| 2% | 1 hour | \\( 0.02 \times 720/1 = 14.4 \\) | page, with a 5-minute check |
| 5% | 6 hours | \\( 0.05 \times 720/6 = 6 \\) | page, with a 30-minute check |
| 10% | 3 days | \\( 0.10 \times 720/72 = 1 \\) | ticket, with a 6-hour check |

Why *two* windows? The long one is a **water-leak detector** (slow, steady loss that matters); the short one is a **smoke alarm** confirming the problem is *still happening now*, so the alert clears soon after you fix it.

**Where it breaks.** It assumes errors are counted consistently over time and events are comparable; low-traffic periods make short windows noisy.

</div>

<div class="widget" data-widget="burn"></div>

**Use the budget as a design currency.** Before building, compute the predicted composite availability (Chapter 3, with correlation from Chapter 4). If it is below the SLO, the *design* is wrong, and no operational heroics will fix it. Once running, an unspent budget funds speed; a spent budget buys reliability work.

## How many nines are worth buying?

<div class="derivation">

<span class="tag">Derivation · the value of one more nine</span>

**Question.** If a minute of downtime costs \\( c \\), what is an additional nine worth?

1. Annual downtime at unavailability \\( U \\) is \\( U \times 525{,}960 \\) minutes, costing \\( U \times 525{,}960 \times c \\).
2. One more nine cuts \\( U \\) to \\( U/10 \\), saving \\( 0.9\\,U \times 525{,}960 \times c \\).
3. Each nine therefore saves **one tenth** of what the previous one saved. The *value* of nines falls geometrically, while the *cost* of achieving them rises (from "fix bugs" to "remove shared fate" to "replace the architecture").
4. **Stopping rule:** buy another nine while the saving exceeds the cost. Because the saving shrinks tenfold each step and cost grows, there is a crossing point. It is the logic of an *insurance premium*: pay a certain cost to shrink an uncertain loss, and stop when the marginal premium exceeds the marginal loss avoided.

**Worked table** at an illustrative \\( c = \$2{,}000 \\) per minute:

| Availability | Downtime/year | Yearly downtime cost | Value of the next nine |
|---|---|---|---|
| 99% | 5,260 min | $10.5 M | $9.5 M |
| 99.9% | 526 min | $1.05 M | $946 k |
| 99.99% | 52.6 min | $105 k | $94.6 k |
| 99.999% | 5.26 min | $10.5 k | $9.5 k |

Going from 99.9% to 99.99% saves about 473 minutes, roughly $946,000 a year. Spend up to that to get there; beyond it, do not. If a minute costs $20, stop at three nines.

</div>

> [!TIP]
> If nobody can say what downtime costs, you cannot choose a nines target sensibly. Obtaining that number is itself a reliability task.

## Quantifying risk

<div class="derivation">

<span class="tag">Derivation · expected loss and what to fix first</span>

**Expected loss.** For failure mode \\( i \\) with probability \\( P_i \\) of occurring (per year) and impact \\( L_i \\) when it does, the *expected* annual loss is \\( P_i L_i \\) (the definition of an expected value: outcome × probability, summed over outcomes). Total: \\( \sum_i P_i L_i \\).

**Is a mitigation worth it?** Suppose mitigation \\( i \\) removes a fraction \\( e_i \\) of the risk and costs \\( K_i \\).

1. Risk removed \\( = P_i L_i\\,e_i \\); residual risk is \\( P_i L_i(1-e_i) \\).
2. Do it if the risk removed exceeds the cost: \\( P_i L_i\\,e_i > K_i \\).
3. With a limited budget, rank by **benefit per unit cost**, \\( P_i L_i e_i / K_i \\), and take the highest first (this greedy rule is optimal when items can be bought in pieces, and near-optimal otherwise).
4. Minimising "cost spent + residual risk" is the same rule seen from the other side.

**Why detectability belongs in the score.** The damage from a failure is roughly

\\[ \text{user-minutes lost} \approx \text{occurrences per year} \times \text{duration} \times \text{users affected} \\]

and *duration* includes however long the failure ran **before anyone noticed**. A loud crash is noticed in a minute; a silent duplicate or a gray failure can run for days. Hard-to-detect is therefore a **multiplier on duration**, which is why it belongs in the product.

**FMEA's risk priority number** is the same idea in coarse 1-10 scores:

\\[ \text{RPN} = \text{Severity} \times \text{Occurrence} \times \text{Detectability} \\]

(Severity ~ impact, Occurrence ~ probability, Detectability ~ duration, where *higher means harder to detect*).

**Where it breaks.** The 1-10 scales are *ordinal*: "8" is not twice "4", so the product is a **ranking aid**, not a measurement. Where you can estimate real probabilities and costs, use the expected-loss rule above.

</div>

### A worked ranking (illustrative)

| Failure mode | S | O | D | RPN |
|---|---|---|---|---|
| Same bad config reaches all clusters | 9 | 5 | 3 | **135** |
| Duplicate dispatch after replay | 7 | 4 | 8 | **224** |
| One carrier-API endpoint goes gray | 6 | 6 | 7 | **252** |
| Single pod OOM-killed | 2 | 8 | 2 | 32 |
| Region-wide cloud outage | 10 | 1 | 2 | 20 |

The silent, subtle ones top the list; the dramatic ones sink. That matches experience: the incidents people remember are usually not the ones the risk register predicted.

> [!IMPORTANT]
> A rare failure that is **invisible** (silent duplication, a gray failure, corrupted replication) is far more dangerous than a loud crash. Weight the Detectability term up.

**Add recovery risk.** Include the probability that the *recovery procedure itself* fails: an untested failover, a backup that cannot be restored, a stale runbook. An untested recovery path has an effective availability near zero.

## Where the minutes go

Since \\( U \approx \lambda\\,\text{MTTR} \\) (Chapter 3), recovery time deserves a breakdown. MTTR is a relay race; its total is the sum of the legs:

\\[ \text{MTTR} = t_{\text{detect}} + t_{\text{diagnose}} + t_{\text{decide}} + t_{\text{act}} + t_{\text{verify}} \\]

| Phase | Typical lever |
|---|---|
| Detect | SLO burn alerts; client-side probes |
| Diagnose | Traces, change markers on dashboards, good logs |
| Decide | Runbooks with **default actions** (e.g., roll back first) |
| Act | Automation: one-click rollback, traffic shift |
| Verify | Automated post-condition checks |

You can only speed the race by finding the *slowest* leg. Teams usually time the leg that is easy to measure (the fix) and overlook the one invisible until you look: how long the failure ran before any alert fired. Measure all five once; the biggest surprise is nearly always *detect* or *decide*.

<div class="rules">

<span class="tag">Rules of thumb</span>

1. **Hours to exhaust the budget = window in hours ÷ burn rate.** (720/14.4 = 50.)
2. **Pick the share of budget you will lose before waking someone; the burn threshold follows.**
3. **Each nine is worth one tenth of the previous.** Stop buying when cost exceeds value.
4. **Damage = how often × how long × how many.** Hidden failures last longer, so they cost more.
5. **Time all five legs of MTTR once.** The slowest is rarely the one you expect.

</div>

## Checkpoint

<details>
<summary>1. SLO 99.95% over 28 days. How many minutes of budget? What burn rate exhausts it in 2 days?</summary>

Budget: \\( 0.0005 \times 28 \times 1440 = 20.16 \\) min. Exhausting in 2 days out of 28 is a burn of \\( 28/2 = 14 \\).

</details>

<details>
<summary>2. Why might an RPN of 252 outrank a worse-sounding RPN of 20?</summary>

Because RPN multiplies how bad, how often, and *how hidden*. A moderate failure that happens regularly and goes unseen causes more cumulative harm than a catastrophic but rare, highly visible one that you will notice and handle immediately.

</details>

<details>
<summary>3. A design review predicts 99.92% composite availability against a 99.95% SLO. What do you do?</summary>

Change the design before building: remove hard dependencies, convert some to soft or async, cut correlation, or renegotiate the SLO with the business using the cost-of-downtime number. Do not rely on "operational excellence" to close a structural gap.

</details>

## Takeaways

- **Budget = (1 − SLO) × window; burn = error rate ÷ (1 − SLO).** Alert on burn.
- **Predict availability before you build**; compare to the SLO.
- Choose nines by **cost of downtime**, not by taste.
- Rank risks with **P × impact**, and weight **detectability** heavily.
- Decompose MTTR; attack the largest term.

<div class="notebook">

<span class="tag">Tessera notebook · entry 9</span>

**SLO:** 99.95% successful acknowledgements per 30 days; 99% of accepted orders reach dispatch within 60 s.
**Alerts:** multi-window burn-rate (fast + slow) on both. Change markers appear on every graph.
**Top risks (by RPN):** gray failure of the carrier API · duplicate effects after replay · shared config reaching all clusters. Each gets a named owner and a detector.

</div>

**Next:** the method, end to end. [The Ten-Step Framework](ch10-the-framework.md).
