# The Ten-Step Framework

<div class="coldopen">

<span class="tag">Cold open · fictional hallway conversation</span>

```
Ines:  "New service next sprint: Quotes. Ninety minutes with you at a whiteboard.
        Tell me how it fails, and what we do about it."
You:   "...retries? A circuit breaker?"
Ines:  "That's the answer. What's the question?"
```

</div>

Here is the method that produces the answer. Ten steps; each ends with something you can *write down* and a reviewer can *challenge*. Take the whiteboard version first, then each step in turn.

## The one-page version

```
 1  Define "correct"           → invariants (safety) + SLOs (liveness)
 2  Map the system             → dependency graph (hard/soft/async), data ownership, shared fate
 3  Enumerate faults           → fault-model matrix, layer by layer
 4  Quantify                   → availability, capacity under loss, tails, correlation (β)
 5  Choose response classes    → mask / bound / refuse / degrade / replace / choose-C-or-A / quarantine / contain
 6  Design state for failure   → owners, idempotency, versions, fencing, RPO/RTO
 7  Design for overload        → limits from Little's Law, priorities, recovery headroom, loop-cutting
 8  Design the detectors       → one signal per failure row; client-side; independent of what it watches
 9  Verify                     → inject faults, load-with-failure, models, game days
10  Operate and learn          → staged change, SLO-gated rollout, post-incident updates to the model
```

## Step 1: Define "correct"

List the **safety invariants** (never violated) and **liveness/SLO targets**. For each invariant, classify it with CALM (Chapter 2): *coordination-free* or *needs agreement*. Note the cost of violating it.

**Output:** the invariant register. *(Tessera: Notebook 1.)*

## Step 2: Map the system as a graph

Draw the dependency graph and label each edge **hard / soft / async**, with fan-out and criticality. Add a **state map**: for every piece of data, the source of truth, who may write, how it replicates, and how it is read. Mark **shared fate**: anything global (DNS, identity, config, schema, control planes, CI/CD, observability).

**Output:** an annotated dependency and data-ownership graph; the shared-fate register.

## Step 3: Enumerate faults with the fault-model matrix

For every component and edge, at every layer (Part IV), fill in a row:

| Component / edge | Fault | Model | Detectable? | Blast radius | Correlated with | Invariant at risk | Response (currency) |
|---|---|---|---|---|---|---|---|
| Ingestion → carrier API | One endpoint hangs | Gray | Only caller-side | ~1/3 of pricing calls | Other callers of that API | L2 | Eject by outcome; cached tariff (space/semantics) |

Prompt yourself with the verbs: *crash, hang, slow, partial, duplicated, reordered, stale, corrupt, overloaded, misconfigured, expired, full, clock-skewed, version-skewed.*

**Output:** the matrix. It will grow with every incident.

## Step 4: Quantify

Compute, with numbers (even rough ones):

- composite **availability** along each critical path (Ch. 3), with **β** for each redundancy group (Ch. 4);
- **capacity under loss** and **recovery drain time** (Ch. 5);
- **tail latency** for each fan-out (Ch. 5);
- the **error-budget** consequence (Ch. 9).

**Output:** a budget table showing where the SLO is lost and which terms dominate.

## Step 5: Choose a response class for each failure

| Failure class | First-principles response | Currency |
|---|---|---|
| Transient, short, safe to repeat | **Mask**: bounded retry with idempotency, inside a deadline and a budget | time + information |
| Slow or gray | **Bound**: deadlines, concurrency caps, outlier ejection, optional hedge | time, information |
| Overload | **Refuse early**: admission control, prioritised shedding, backpressure | semantics |
| Dependency down (soft) | **Degrade**: cache, stale, default, partial result, queue for later | semantics |
| Dependency down (hard) | **Fail fast and clearly**; do not hold resources while waiting | time |
| Crash | **Replace**: redundancy, fast restart, stateless or durable state | space |
| Partition | **Choose per invariant**: consistency (refuse) or availability (accept and reconcile) | semantics |
| Poison input or corrupt state | **Quarantine**: validate at boundaries, dead-letter, stop the spread | semantics |
| Bad change | **Limit blast radius, roll back fast**: staged rollout, auto-abort on SLO | space + information |
| Unknown unknowns | **Contain**: cells, shuffle sharding, kill switches, observability depth | space |

> [!TIP]
> If your answer to a row is "retry," ask the Chapter 6 questions: *who else retries, what is the budget, and is the operation idempotent?* If your answer is "replicate," ask the Chapter 4 question: *what do the replicas share?*

## Step 6: Design state for failure

Prefer a **single owner per entity** to conflict resolution. Make every mutation **idempotent or atomically deduplicated** (Ch. 8). Add **versions and fencing** so stale actors cannot overwrite newer state. Define compensations and a reconciliation job for workflows. Fix **RPO/RTO** and test restoration.

## Step 7: Design for overload and recovery

Compute concurrency limits from **Little's Law**. Define **priority classes** and a shedding order. Ensure **recovery headroom**. List every **feedback loop** (Ch. 6) and name the mechanism that cuts each one.

## Step 8: Design detectors

For every row of the matrix, name the signal that detects it and the alert that fires. A failure with no detector is an **accepted silent risk**: write that down, so it is a decision and not an accident. Measure from the **client's perspective**, add **saturation** signals (queues, pools, throttling) and **correctness** signals (duplicates, reconciliation diffs, data age). Keep observability out of the fault domain it observes.

## Step 9: Verify

Inject faults against a **steady-state hypothesis**, with a bounded blast radius. Load-test *with failure* (lose a cluster at peak; slow a dependency tenfold). Property-test idempotency and state machines. Model-check the few protocols where mistakes are catastrophic. Run game days. Chapter 17 is devoted to this.

## Step 10: Operate and learn

Roll out in stages with automatic abort on SLO regression. Treat config as code. After every incident, update the **matrix**, the **estimates** (λ, MTTR, β), and the **detectors**. Every incident is a measurement of how wrong your model was.

## Where it goes wrong

> [!WARNING]
> **Pitfall: doing Step 5 first.** Jumping to mechanisms before invariants, quantification and fault enumeration yields lots of resilience theatre. The patterns get applied where they are fashionable, not where the maths says the risk is.

## Checkpoint

<details>
<summary>1. Why does Step 4 (quantify) come before Step 5 (choose responses)?</summary>

Because the numbers tell you which responses are worth their cost. If the composite path is already 99.99% and the SLO is 99.9%, adding complexity is a net loss. If shared fate dominates, adding replicas is wasted.

</details>

<details>
<summary>2. What does it mean to have a failure row with no detector?</summary>

It is an *accepted silent risk*, and must be listed as such with a rationale, or covered by a periodic reconciliation. Otherwise it is a surprise waiting to happen.

</details>

<details>
<summary>3. Which steps would you do again after every incident?</summary>

Mostly 3, 4, 8 and 10: update the fault matrix, re-estimate the numbers, add or fix detectors, and adjust how changes ship. Sometimes 1 and 2 if the incident revealed a hidden invariant or dependency.

</details>

## Takeaways

- Ten steps, each with a **written output** that a reviewer can challenge.
- **Invariants → graph → faults → numbers → responses**, in that order.
- Every failure row needs a **response, a currency and a detector**, or an explicit acceptance.
- The method is a loop: **incidents update the model.**

<div class="notebook">

<span class="tag">Tessera notebook · entry 10</span>

We now have inputs to Steps 1–2 (invariants, shared fate), parts of Step 4 (path budget), rules for Steps 5–7 (unknown outcome, retry policy, concurrency caps, fencing, outbox) and the start of Step 8 (health model, burn alerts). **Part IV** fills the matrix layer by layer.

</div>

**Next:** the layer-by-layer tour. Start at the ground. [Ground, Wire, and Platform](ch11-ground-wire-platform.md).
