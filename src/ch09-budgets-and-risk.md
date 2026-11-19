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

Choose a **service level objective**: a target success proportion over a window (say 99.9% over 30 days). The **error budget** is what is left over:

\\[ \text{budget} = (1 - \text{SLO}) \times \text{window} \\]

For 99.9% over 30 days that is 43.2 minutes of full outage. The **burn rate** says how fast you are spending it:

\\[ \text{burn} = \frac{\text{observed error rate}}{1 - \text{SLO}} \\]

A burn rate of 1 spends the budget exactly over the window. A burn rate of 14.4 sustained for one hour spends \\( 14.4/720 = 2\% \\) of a 30-day budget.

<div class="widget" data-widget="burn"></div>

**Alert on burn, not on raw errors.** The standard pattern pairs a *fast* burn (high rate, short window) to catch sudden failures with a *slow* burn (low rate, long window) to catch creeping ones; requiring both a short and a long window to agree keeps false alarms low.

**Use the budget as a design currency.** Before building, compute the predicted composite availability (Chapter 3, with correlation from Chapter 4). If it is below the SLO, the *design* is wrong, and no operational heroics will fix it. Once running, an unspent budget funds speed; a spent budget buys reliability work.

## How many nines are worth buying?

Each additional nine cuts downtime by 10×, but the cost of achieving it grows faster than linearly: you move from "fix bugs" to "remove shared fate" to "replace architecture." Use a break-even check.

*Illustrative.* Going from 99.9% (about 526 minutes a year of downtime) to 99.99% (about 53) saves ~473 minutes. If a minute of downtime costs the business about $2,000, that is ~$946,000 per year. Spend up to that on getting there; beyond it, don't. If a minute costs $20, stop at three nines and invest the money elsewhere.

> [!TIP]
> If nobody can say what downtime costs, you cannot choose a nines target sensibly. Obtaining that number is itself a reliability task.

## Quantifying risk

Every failure mode has a probability and an impact:

\\[ \text{risk}_i = P_i \times \text{impact}_i \\]

Choose mitigations to minimise the sum of mitigation cost and **residual** risk:

\\[ \min \\; \sum \text{cost}_{\text{mitigation}} + \sum P_i\\, \text{impact}_i\\,(1 - e_i) \\]

where \\( e_i \\) is how effective the mitigation is. In practice, rank with a coarse score such as **FMEA's risk priority number**:

\\[ \text{RPN} = \text{Severity} \times \text{Occurrence} \times \text{Detectability} \\]

each on a 1–10 scale, where for **Detectability** *higher means harder to detect*. This third factor is the one engineers forget, and it is the most important in distributed systems:

> [!IMPORTANT]
> A rare failure that is **invisible** (silent duplication, a gray failure, corrupted replication) is far more dangerous than a loud crash. Weight the Detectability term up.

### A worked ranking (illustrative)

| Failure mode | S | O | D | RPN |
|---|---|---|---|---|
| Same bad config reaches all clusters | 9 | 5 | 3 | **135** |
| Duplicate dispatch after replay | 7 | 4 | 8 | **224** |
| One carrier-API endpoint goes gray | 6 | 6 | 7 | **252** |
| Single pod OOM-killed | 2 | 8 | 2 | 32 |
| Region-wide cloud outage | 10 | 1 | 2 | 20 |

The silent, subtle ones top the list; the dramatic ones sink. This matches experience: the incidents people remember are usually not the ones the risk register predicted.

**Add recovery risk.** Include the probability that the *recovery procedure itself* fails: an untested failover, a backup that cannot be restored, a stale runbook. An untested recovery path has an effective availability near zero.

## Where the minutes go

Since \\( U \approx \lambda \cdot \text{MTTR} \\), recovery time deserves a breakdown:

\\[ \text{MTTR} = t_{\text{detect}} + t_{\text{diagnose}} + t_{\text{decide}} + t_{\text{act}} + t_{\text{verify}} \\]

| Phase | Typical lever |
|---|---|
| Detect | SLO burn alerts; client-side probes |
| Diagnose | Traces, change markers on dashboards, good logs |
| Decide | Runbooks with **default actions** (e.g., roll back first) |
| Act | Automation: one-click rollback, traffic shift |
| Verify | Automated post-condition checks |

Most teams discover their largest term is *diagnose* or *decide*, which are information and process problems, not hardware ones.

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
