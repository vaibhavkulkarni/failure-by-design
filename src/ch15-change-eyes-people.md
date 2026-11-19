# Change, Eyes, and People

*Layers 8–10: how the system changes, how we see it, and who operates it.*

<div class="coldopen">

<span class="tag">Cold open · fictional on-call log</span>

```
Sat 00:00:00 UTC  Wildcard certificate for *.tessera-internal expires.
Sat 00:00:03      Mesh proxies in all three clusters reject peer certificates.
Sat 00:00:04      Services cannot talk to each other. Every cluster. Same second.
Sat 00:00:30      Alerting pipeline: also behind the same mesh. No alerts fired.
Sat 00:41:00      Customer notices. Support pages on-call. On-call's laptop VPN: also behind the mesh.
```

</div>

Three failures in one story: a **change in time** (expiry) that hit every fault domain together; **observability** that lived inside what it observed; and a **human recovery path** that depended on the thing that broke. This chapter covers all three.

---

## Layer 8: Change, configuration, release

| | |
|---|---|
| **What fails** | Bad deploys; config errors; flag flips; schema changes; dependency upgrades; **certificate, secret and token expiry and rotation**; environment drift (overlays that differ between clusters); simultaneous rollout to all domains; incompatible versions coexisting mid-rollout; infrastructure-as-code mistakes with a huge blast radius |
| **Key question** | What is the **blast radius of one wrong change**, and how fast do we detect and revert it? |
| **Math** | Change-failure rate × MTTR is a direct term in \\( U = \lambda\\,\text{MTTR} \\); β (Ch. 4) is largely a property of *how correlated your changes are across domains* |
| **See it** | Change-correlated anomalies, deploy markers on every dashboard, drift detection between environments, **time-to-expiry** alerts |

### Stance

1. **Config is code.** Reviewed, versioned, validated, staged. A typo should fail a *build*, not production. Use typed schemas and safe defaults.
2. **Never change every fault domain in one wave.** Deliberate time-skew is the cheapest decorrelation (Ch. 4). Roll out cluster by cluster, with a canary, and **automatic abort on SLO regression**.
3. **Treat expiry as a failure mode.** Certificates, tokens, client secrets, licences, quotas, database sequences, anything with a deadline. Monitor the *time remaining*; automate rotation; **test the rotation path**; and make credential refresh degrade gracefully (cache tokens, refresh early with jitter, survive identity-provider outages without a thundering herd).
4. **Keep kill switches** for risky features, and test that turning them off works.
5. **Make rollback the default first response**, and make it fast (Ch. 9: MTTR's *act* term).

> [!IMPORTANT]
> **Stagger the clock too.** If everything expires at the same instant, β is 1 for that failure. Issue certificates and secrets with *different* lifetimes and rotation times across clusters.

---

## Layer 9: Observability and the control plane

| | |
|---|---|
| **What fails** | Telemetry pipelines overloaded; high-cardinality blowups; alert storms; dashboards that **average away tails**; missing client-side signals; observability sharing a fault domain with production; tracing overhead adding latency; sampling that misses rare failures |
| **Key question** | If this layer failed, **would I know**, and could I still operate? |
| **Math** | Percentiles versus means (Ch. 5); sampling for rare events; burn-rate windows (Ch. 9) |
| **See it** | The observer's own health: ingestion lag, dropped spans/metrics, alert-delivery tests |

### Stance

- **Alert on symptoms** (SLO burn); use cause-based metrics for diagnosis, not for paging.
- **Keep an independent "is it working" probe**, a synthetic transaction from *outside* the production fault domain.
- **Use percentiles and histograms, never averages**, for latency.
- **Sample the interesting**: tail-based tracing keeps the slow and failed traces. Uniform sampling at 1% will almost never show a 1-in-10,000 failure.
- **Bound telemetry overhead**, and make the telemetry path *lossy by design* under pressure: **shed telemetry before you shed user traffic.**
- **Break-glass access** must not depend on the systems it is used to repair.

---

## Layer 10: Humans and organisation

| | |
|---|---|
| **What fails** | Unclear ownership; stale or untested runbooks; alert fatigue; knowledge silos; escalation delays; risky manual recovery steps; teams coupled by release schedules; incentives that reward features over reliability; the **distributed monolith** (services that must deploy and fail together) |
| **Key question** | Is every failure mode in the matrix **owned** by someone who can detect and fix it within the target MTTR? |
| **Math** | \\( \text{MTTR} = t_{\text{detect}} + t_{\text{diagnose}} + t_{\text{decide}} + t_{\text{act}} + t_{\text{verify}} \\) (Ch. 9) |
| **See it** | Time-to-detect, time-to-mitigate, repeat-incident rate, runbook usage and accuracy |

### Stance

- **Automate the *act*, simplify the *decide*, instrument the *diagnose*.** Runbooks should state a **default action** ("if the last change is within 30 minutes: roll back") so decision time shrinks.
- **Rehearse.** Game days (Ch. 17) are how runbooks stay true.
- **Align architecture with ownership.** If a failure's blast radius crosses team boundaries, so does the incident. Reduce synchronous coupling so teams can fail, and deploy, independently.
- **Beware the distributed monolith.** If a hundred services must all be up for a user journey, then by Chapter 3 your availability is the product of *every team's*. The fix is architectural (async, soft dependencies, cells), not managerial.
- **Blameless reviews that change the model.** Each incident updates the fault matrix, the estimates and the detectors, or it was wasted.

## Checkpoint

<details>
<summary>1. What three design flaws turned a certificate expiry into a 41-minute blind outage?</summary>

(1) *Synchronised expiry* across all fault domains (β = 1). (2) *Observability inside the mesh* it was supposed to observe. (3) *Break-glass access* behind the same dependency. Plus: no time-to-expiry alert.

</details>

<details>
<summary>2. Why is "deliberate delay between clusters" counted as redundancy?</summary>

It decorrelates time. A bad change shows up in the first cluster while the others are still healthy, turning a total outage into a partial one and giving you a rollback window.

</details>

<details>
<summary>3. What is a good first question about any runbook?</summary>

"When did someone last *execute* it end to end?" An unrehearsed runbook is a document, not a capability.

</details>

## Takeaways

- **Change is the biggest source of correlated failure.** Stage it, validate it, auto-abort it.
- **Expiry is a scheduled outage** unless you monitor and rehearse it.
- **Observe from outside** what you observe; shed telemetry before traffic.
- **People are a layer**: ownership, rehearsal and aligned architecture set your MTTR.

<div class="notebook">

<span class="tag">Tessera notebook · entry 15</span>

**Change.** Cluster order Cedar → Birch → Ash with a soak period; automatic rollback on burn-rate; config validated in CI. **Expiry.** Staggered certificate lifetimes; alerts at 30/14/7 days; rotation drilled quarterly. **Observe.** External synthetic probe with its own alert path; tail-based tracing. **People.** Break-glass access independent of the mesh; every matrix row has an owner; runbooks stating default actions.

</div>

**Next:** put it all together. [The Tessera Case](ch16-the-tessera-case.md).
