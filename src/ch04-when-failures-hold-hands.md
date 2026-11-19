# When Failures Hold Hands

<div class="coldopen">

<span class="tag">Cold open · fictional on-call log</span>

```
14:00  Config change "raise-ingest-timeout" merged. Rolled to Ash, Birch, Cedar in one wave.
14:04  Ash ingestion: 500s.    Birch ingestion: 500s.    Cedar ingestion: 500s.
14:05  Global traffic manager: "all backends unhealthy". Shedding to nowhere.
14:06  Three clusters. Three independent regions. Three separate on-call rotations.
14:06  One typo in one file.
14:19  rolled back. Three clusters, one cause.
```

</div>

Your redundancy maths promised six nines. One YAML typo delivered zero. The gap between those numbers has a name: **correlation**.

## Why independence is a fantasy

The parallel formula assumed replicas fail independently. In practice, replicas **share fate**: the same release, config, certificate, dependency, control plane, bad input or human. When *those* fail, they fail together.

The standard first model is the **β-factor** (common-cause) model. Let \\( U = 1 - a \\) be one replica's unavailability. Assume a fraction \\( \beta \\) of its failures hit *all* replicas at once:

\\[ U_{\text{common}} = \beta\\, U, \qquad U_{\text{indep}} = (1-\beta)\\,U \\]

\\[ U_{\text{system}} \\;\approx\\; \beta\\,U \\;+\\; \big((1-\beta)\\,U\big)^{m} \\]

*Worked number.* Two replicas of 99% each (\\( U = 0.01 \\)), with \\( \beta = 0.1 \\):

\\[ U_{\text{system}} \approx 0.001 + (0.009)^2 = 0.001081 \\;\Rightarrow\\; A \approx 99.89\% \\]

Independence predicted 99.99%. You got a tenth of the nines.

<div class="widget" data-widget="ccf"></div>

Slide **replicas** up and watch: the result barely moves, because it is pinned by \\( \beta U \\). **Past a point, more replicas buy nothing; you are bounded by the common-cause term.** The only lever is to reduce β, which means *decorrelating*.

## Where β hides

Read this list slowly and mark what your system shares:

- The **same artifact** deployed everywhere at the same moment
- The **same configuration source** (one repo, one flag service, one operator)
- A **global control plane**: DNS, traffic manager, identity provider, service-mesh controller, certificate authority
- A **shared datastore** or schema, including a migration that runs once for everyone
- **Shared libraries**: one bug in a client SDK is in every service
- **Identical load patterns**: a synchronized cron job, a retry storm, a midnight batch
- **Humans**: the same on-call, the same runbook, the same mistaken mental model
- **Time**: a leap second, an expiring wildcard certificate, a clock-skew event

> [!IMPORTANT]
> Count a replica as independent only if it differs from the others on **every** axis that matters for the failure you are modelling.

## Reducing β in practice

| Lever | What it decorrelates |
|---|---|
| **Staggered rollout** (one cluster, then a canary, then the rest) | Release and config faults |
| **Independent control planes** | Platform faults |
| **Diverse dependency paths** (second identity-provider endpoint, secondary DNS) | Dependency faults |
| **Time skew** in cron jobs and cache TTLs (jitter) | Synchronised load |
| **Gradual feature enablement** | Logic faults |

Deliberate delay between fault domains is *the cheapest redundancy you can buy*: the rollout that finds the typo in Ash costs you 20% of capacity for four minutes, not 100% for fifteen.

## Blast radius and cells

**Blast radius** is the fraction of users hurt when one fault domain fails. With \\( N \\) equal, perfectly isolated **cells**, a failure in one cell affects \\( 1/N \\) of the traffic. Cell design asks: *what is the unit of failure, and how big is it?*

### Shuffle sharding: a tiny blast radius without N cells

Give each client a random subset of \\( k \\) workers out of \\( N \\). A poison request, or a noisy tenant, takes down only that client's subset. The number of distinct subsets is \\( \binom{N}{k} \\), so the chance another client shares your *entire* subset is \\( 1/\binom{N}{k} \\).

<div class="widget" data-widget="shuffle"></div>

With \\( N = 100 \\), \\( k = 5 \\) there are about 75 million shards. A client that retries against its own five workers, and kills them, barely touches anyone else.

> [!WARNING]
> **Pitfall: redundancy without isolation.** A hot standby that shares the primary's config, schema, certificate and deploy pipeline is a *second place to be broken*, not a second chance.

## Checkpoint

<details>
<summary>1. You have 4 replicas at 99.9% each, β = 0.2. What is the system unavailability, approximately?</summary>

\\( U = 0.001 \\). Common part: \\( 0.2 \times 0.001 = 2\times10^{-4} \\). Independent part: \\( (0.0008)^4 \approx 4\times10^{-13} \\), negligible. Total ≈ \\( 2\times10^{-4} \\), so \\( A \approx 99.98\% \\), set entirely by β. A fifth replica changes nothing.

</details>

<details>
<summary>2. Name three things Tessera's three clusters share even though they are "independent".</summary>

Any of: global traffic manager, identity provider, DNS, the CI/CD pipeline, the config repository, the single logical database schema, the service-mesh version, the third-party carrier API, the on-call team.

</details>

<details>
<summary>3. Why is staggering a rollout "redundancy"?</summary>

It makes *time* a decorrelating dimension: a bad change is detected while only one domain has it. You spend a little latency of delivery to turn a correlated total failure into an independent partial one.

</details>

## Takeaways

- Replicas are only as independent as their **shared fate** allows; **β sets the ceiling**.
- Find shared fate by auditing artifact, config, control plane, data, load, humans and time.
- **Decorrelate cheaply**: stagger, jitter, diversify.
- **Cells and shuffle sharding** shrink blast radius.

<div class="notebook">

<span class="tag">Tessera notebook · entry 4</span>

**Shared-fate register (v1):** global traffic manager · identity provider · DNS · CI/CD and the config repo · the logical database and its schema · mesh control-plane version · carrier-rate API.

**Rule of staggering:** *no change reaches more than one cluster in the same wave.* Config gets the same treatment as code. Cluster order is Cedar → Birch → Ash.

</div>

**Next:** even without failure, latency itself obeys maths that surprises people. [The Tail and the Queue](ch05-the-tail-and-the-queue.md).
