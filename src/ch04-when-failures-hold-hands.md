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

The parallel formula assumed replicas fail independently. In practice, replicas **share fate**: the same release, config, certificate, dependency, control plane, bad input or human. When *those* fail, they fail together. We need a model that puts a number on it.

<div class="derivation">

<span class="tag">Derivation · the common-cause (β) model</span>

**Question.** Each replica is unavailable a fraction \\( U \\) of the time, but some of that downtime is *shared* across replicas. What is the unavailability of \\( m \\) replicas?

**Assumptions.**
(a) Split each replica's downtime by cause. **Common-cause** events hit all replicas at the same instant; a fraction \\( \beta \\) of the downtime comes from them. **Individual** events hit one replica at a time and account for the remaining fraction \\( 1-\beta \\).
(b) Common-cause events and the replicas' individual events are independent of one another.
(c) Unavailabilities are small.

**Derivation.**

1. The chance the system is inside a common-cause outage is \\( P_c = \beta U \\).
2. A single replica is down from its *own* events with probability \\( q = (1-\beta)U \\).
3. The system is down if the common cause is active **or** all \\( m \\) replicas are individually down.
4. All \\( m \\) individually down: independent, so multiply, \\( P_i = q^{m} = \big((1-\beta)U\big)^{m} \\).
5. For "A or B" with independent events, \\( P(A \text{ or } B) = P(A) + P(B) - P(A)P(B) \\). The product term is tiny (a product of two small numbers), so

\\[ U_{\text{sys}} \approx \beta U + \big((1-\beta)U\big)^{m} \\]

The first term is the **shared** part: no replica helps with it. The second is the **independent** part: it shrinks with every replica added.

**Reading the result: limiting cases.**

| Case | What happens |
|---|---|
| \\( \beta = 0 \\) | The textbook formula \\( U^m \\): full benefit |
| \\( \beta = 1 \\) | \\( U_{\text{sys}} = U \\): replicas are worthless |
| \\( m \to \infty \\) | You hit the floor \\( \beta U \\) and never go lower |

*Worked number.* Two 99% replicas (\\( U = 0.01 \\)) with \\( \beta = 0.1 \\): \\( 0.001 + (0.009)^2 = 0.001081 \\), so \\( A \approx 99.89\% \\). Independence predicted 99.99%. You got a tenth of the nines.

**How to estimate β.** Count incidents. If a replica had 10 incidents last year and 2 of them also took down the others, \\( \beta \approx 2/10 = 0.2 \\). Doing this *per failure type* (deploys, config, dependencies, hardware) is more useful than one global number.

**Where it breaks.** One number cannot describe every pattern of partial correlation (two of three clusters sharing a fault), and β varies by failure type and over time. Its value is that it makes correlation *explicit and measurable*.

</div>

**Diminishing returns, in numbers** (\\( U = 10^{-3} \\), \\( \beta = 0.1 \\)), straight from the formula:

| Replicas \\( m \\) | \\( U_{\text{sys}} = 10^{-4} + (9\times10^{-4})^{m} \\) | Improvement over previous |
|---|---|---|
| 1 | \\( 1.0\times10^{-3} \\) | (baseline) |
| 2 | \\( 1.008\times10^{-4} \\) | **about 10×** |
| 3 | \\( 1.0000073\times10^{-4} \\) | under 1% |
| 4 | \\( 1.00000007\times10^{-4} \\) | nothing |

The second replica bought nearly everything it ever will. The third was a rounding error. Spending on the *next* replica is pointless; spending on lowering β is not.

<div class="widget" data-widget="ccf"></div>

Slide **replicas** up and watch: the result barely moves, because it is pinned by \\( \beta U \\).

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

**Blast radius** is the fraction of users hurt when one fault domain fails.

<div class="derivation">

<span class="tag">Derivation · blast radius of N cells</span>

1. Split traffic uniformly over \\( N \\) identical, isolated cells, so each serves a fraction \\( 1/N \\).
2. When one cell fails completely, only its share of traffic is affected: **blast radius = \\( 1/N \\)**.
3. *Condition:* this holds only if the failure cannot spread. A shared dependency, config or control plane breaks "isolated", and \\( \beta \\) comes straight back.

</div>

### Shuffle sharding: a tiny blast radius without N cells

Give each client a random subset of \\( k \\) workers out of \\( N \\). A poison request, or a noisy tenant, takes down only that client's subset.

<div class="derivation">

<span class="tag">Derivation · counting shards and overlaps</span>

**Question.** If every client gets a random set of \\( k \\) workers from \\( N \\), how likely is another client to share *all* of mine? At least *one* of mine?

**Derivation.**

1. *Count the possible shards.* Choosing \\( k \\) workers in order gives \\( N(N-1)\cdots(N-k+1) \\) possibilities. Each unordered set was counted \\( k! \\) times (once per ordering), so the number of distinct shards is

\\[ \binom{N}{k} = \frac{N!}{k!\\,(N-k)!} \\]

2. If shards are chosen uniformly, another client's shard equals mine with probability \\( 1/\binom{N}{k} \\).
3. *No overlap at all:* the other client must pick all \\( k \\) of its workers from the \\( N-k \\) workers I do **not** have: \\( \binom{N-k}{k} \\) ways out of \\( \binom{N}{k} \\). So

\\[ P(\text{share at least one}) = 1 - \frac{\binom{N-k}{k}}{\binom{N}{k}} \\]

4. *Why it limits damage:* a client is dead only if **all** its \\( k \\) workers are down (it retries across them). A poison client takes down exactly its own \\( k \\), so I am hurt only if my shard is identical to theirs.

**Numbers** for \\( N = 100 \\), \\( k = 5 \\): \\( \binom{100}{5} = 75{,}287{,}520 \\); chance of identical shards about \\( 1.3\times10^{-8} \\); chance of sharing at least one worker about **23%**. Mixing is common and harmless; only total overlap is fatal.

</div>

<div class="widget" data-widget="shuffle"></div>

> [!WARNING]
> **Pitfall: redundancy without isolation.** A hot standby that shares the primary's config, schema, certificate and deploy pipeline is a *second place to be broken*, not a second chance.

<div class="rules">

<span class="tag">Rules of thumb</span>

1. Redundancy defends against **independent** failures. Against shared fate you need **diversity**.
2. The useful number of replicas is small; after that, work on **β**.
3. To find β, ask: *"What single action or event would take down all of these at once?"* Every answer is a term in it.
4. **Delay is diversity.** Staggering changes in time decorrelates them for free.
5. Blast radius: \\( 1/N \\) with \\( N \\) cells; about \\( 1/\binom{N}{k} \\) with shuffle sharding.

</div>

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
