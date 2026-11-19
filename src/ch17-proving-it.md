# Proving It

<div class="coldopen">

<span class="tag">Cold open · fictional game day</span>

```
10:00  Game day. Hypothesis: "Losing cluster Birch at peak keeps ack availability ≥ 99.9% and p99 < 800 ms."
10:05  Inject: drain Birch. Traffic shifts to Ash and Cedar.
10:07  p99 climbs to 1.4 s. Hypothesis violated.
10:08  Cause: Ash and Cedar connection pools to the datastore are sized for 1.0× load, not 1.5×.
10:30  Fix: raise pools, re-run.  10:50: p99 610 ms. Hypothesis holds.
       Nobody was paged. Nobody lost an order. This is the cheap way to learn it.
```

</div>

A design you have not stressed is a hypothesis. This chapter is about turning "should survive" into "did survive", cheaply, before customers do it for you.

## The experiment, in one card

Every fault-injection experiment fits the same template:

```text
EXPERIMENT      : lose one cluster at peak
STEADY STATE    : ack availability ≥ 99.9% ; p99 < 800 ms ; zero invariant violations
HYPOTHESIS      : steady state holds during and after the fault
INJECTION       : drain cluster Birch (traffic manager + pods)
BLAST RADIUS    : canary cell / off-peak / 10% traffic ; auto-abort if burn rate > 10
OBSERVE         : caller-side RED metrics, pool saturation, lag growth, reconciliation diff
ABORT CRITERIA  : SLO burn > 10 for 2 min, or any S1/S2 violation
RESULT / ACTION : (fill in)  → update the fault matrix and estimates
```

Two requirements matter more than the tooling. **A hypothesis** (so you know what "pass" means) and **an invariant check** (so you also test *safety*, not just availability).

## What to inject, layer by layer

| Layer | Injection | What you learn |
|---|---|---|
| 0 | Remove a zone / cluster at peak | N+k headroom; failover load shift |
| 1 | Add latency, loss; drop one direction only; expire a certificate; poison DNS | Timeouts, unknown outcomes, expiry handling |
| 2 | Kill pods in waves; throttle CPU; stall the control plane | Probe design; fail-static; restart storms |
| 3 | Pause the process (GC-like); exhaust a pool | Fencing; bounds and overflow behaviour |
| 4 | Slow one dependency 10×; return errors for one endpoint | Caps, deadlines, ejection, retry budget |
| 5 | Duplicate, delay and reorder messages; insert a poison message; reset offsets | Idempotency; DLQ; replay windows |
| 6 | Skew a clock; partition clusters; fail over the datastore; **restore from backup** | Conflict handling; real RPO/RTO |
| 7 | Send malformed and oversized payloads | Validation; poison-request propagation |
| 8 | Ship a deliberately bad canary; rotate a secret | Auto-abort; rotation path |
| 9–10 | Kill the metrics pipeline; run the incident without the usual tools | Independent probe; break-glass |

## Check invariants, not just uptime

An availability check would have passed during the Chapter 8 duplicate-dispatch incident: every request returned 200. The failure was *safety*. So every experiment needs **invariant checkers** running alongside:

- **S1:** for every idempotency key, count effects. Must be ≤ 1.
- **S2:** every acknowledged order must be present downstream within the SLO window.
- **Ordering:** per-entity versions never regress.

Run them continuously, not only during experiments; they are cheap, and they find real bugs.

## Property-based tests for idempotency

Example-based tests check the cases you thought of. For idempotency and order-insensitivity, state the **property** and let the framework hunt for counterexamples:

```python
from hypothesis import given, strategies as st

@given(st.dictionaries(st.integers(), st.integers(1, 100), max_size=20), st.randoms())
def test_consumer_is_idempotent_and_order_insensitive(msgs, rnd):
    events = list(msgs.items())          # (message_id, amount), ids unique
    shuffled = events[:]
    rnd.shuffle(shuffled)

    baseline = apply_all(events)
    assert apply_all(events + events) == baseline    # every message delivered twice
    assert apply_all(shuffled) == baseline           # delivered in a different order
```

If a consumer *should not* be order-insensitive (it needs per-entity ordering), test that instead: out-of-order input must be **rejected or held**, never silently applied.

## Load tests that include failure

A load test of a healthy system measures the happy path. The interesting tests combine load with faults:

- **Lose a cluster at 100% of peak** (Ch. 5: survivors at 1.5×).
- **Slow one dependency 10× at peak** (Ch. 5: does the pool cap hold?).
- **Restart a consumer group mid-backlog** (Ch. 5/13: does it drain?).
- **Spike with retries enabled** (Ch. 6: do you get the collapsed state?). Try the Chapter 6 widget first to see what to look for.

## Modelling the few protocols that must be right

Testing finds the bugs you can reach. **Model checking** (for example, with TLA+) explores *every* interleaving of a small abstract model. It is worth the effort for the few protocols where a rare ordering is catastrophic: leader election and failover, the outbox relay with fencing, saga state machines. A tiny model of "two relays, one store, tokens, pauses" would have found the Chapter 7 duplicate publication in minutes. Do not model everything; model the parts where the interleavings frighten you.

## Game days: practising the humans

Fault injection tests the system; **game days** test the *procedure*. A good one:

1. **Pick a scenario** from the matrix and write the hypothesis in advance.
2. **Assign roles**: an incident lead, a scribe, someone who injects, someone who *only watches*.
3. **Run it with the real tools**, including the break-glass path.
4. **Time the phases**: detect, diagnose, decide, act, verify (Ch. 9).
5. **Debrief blamelessly**, and **update the matrix, estimates and runbooks** the same week.

Appendix B contains six ready-to-run scenarios.

## How do you know you are improving?

| Signal | Healthy trend |
|---|---|
| Time to detect (median, p90) | Falling |
| Time to mitigate | Falling |
| Share of incidents involving *known* matrix rows | Rising (the model is predictive) |
| Share of incidents with **no detector** | Falling |
| Days since each recovery path was last *executed* | Bounded |
| Experiments where the hypothesis failed | Non-zero (otherwise you are not probing hard enough) |

> [!WARNING]
> **Pitfall: chaos as theatre.** Randomly killing pods in a system with no steady-state definition proves nothing. And an experiment that always passes is a sign your hypothesis is too weak.

## Checkpoint

<details>
<summary>1. Why must the experiment above have an abort criterion?</summary>

Because the hypothesis may be false, and you are running it on real infrastructure. Auto-abort bounds the harm of being wrong; that is what makes experiments cheap enough to run often.

</details>

<details>
<summary>2. What does a property-based test find that example tests don't?</summary>

Inputs you did not think of: unusual duplications, orderings and boundary values. It states the *rule* once and searches the space for violations.

</details>

<details>
<summary>3. Name an invariant checker for Tessera that runs in production.</summary>

A continuous query counting effects per idempotency key (S1), or a job comparing accepted orders with dispatched ones, alerting on any gap older than the SLO window (S2).

</details>

## Takeaways

- Write the **hypothesis** and **abort criteria** first.
- Test **safety** with invariant checkers, not just availability.
- Use **property-based tests** for idempotency and ordering; **model checking** for the few critical protocols.
- **Load plus failure** is the real test; **game days** test people and runbooks.
- Track whether the *model* is getting more predictive.

<div class="notebook">

<span class="tag">Tessera notebook · entry 17</span>

Quarterly game days drawn from Appendix B; invariant checkers S1 and S2 run continuously; every failed hypothesis produces a matrix update within a week; a model of the outbox relay with fencing is kept next to the code.

</div>

**Next:** a kit you can take to your own design reviews. [The Review Kit](ch18-the-review-kit.md).
