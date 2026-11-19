# C. Glossary

**ACI** — associative, commutative, idempotent: the properties that make an operation safe under reordering, regrouping and repetition.

**Admission control** — deciding at the edge which work to accept, so that what is admitted can finish.

**At-least-once** — delivery guarantee in which every message is delivered one or more times; duplicates possible.

**Availability** — the fraction of time (or requests) a system works. \\( A \approx 1 - \lambda\,\text{MTTR} \\).

**Backpressure** — a signal that tells producers to slow down because consumers are saturated.

**Blast radius** — the fraction of users or traffic affected by one fault domain's failure.

**β (beta) factor** — the fraction of a component's failures that hit all replicas simultaneously (common cause).

**Burn rate** — the speed at which an error budget is spent; 1 = exactly on budget.

**CALM** — the theorem that a computation can be coordination-free if and only if it is monotonic.

**Cell** — an isolated, self-contained slice of a system; its failure affects only its share of traffic.

**Compensation** — a business-level undo action for a completed workflow step.

**Crash-recovery** — failure model where processes halt and may return, possibly losing volatile state.

**Dead-letter queue (DLQ)** — a holding place for messages that could not be processed, so the stream keeps moving.

**Deadline** — an absolute time by which a caller needs the result, propagated through downstream calls.

**Differential observability** — the gap between what a component says about itself and what its callers experience; the signature of a gray failure.

**Error budget** — \\( (1-\text{SLO}) \times \text{window} \\); the amount of unreliability you may "spend".

**Fault / error / failure** — cause / wrong internal state / visible deviation from specification.

**Fencing token** — a monotonically increasing number checked by a resource to reject stale actors.

**FLP** — the result that deterministic consensus is impossible in a fully asynchronous system with even one crash fault.

**Gray failure** — a partial failure where self-reported health is fine but users are affected.

**Goodput** — the rate of *useful, completed* work, as opposed to offered load.

**Hedged request** — a duplicate request sent after a delay to cut tail latency.

**Idempotent** — applying twice has the same effect as applying once: \\( f(f(x)) = f(x) \\).

**Invariant** — a property that must always hold (safety) or eventually hold (liveness).

**Lease** — time-limited exclusive right; a liveness hint, not a safety mechanism without fencing.

**Little's Law** — \\( L = \lambda W \\); concurrency equals arrival rate times time in system.

**Liveness / safety** — "something good eventually happens" / "nothing bad ever happens".

**Load shedding** — deliberately rejecting excess work to protect the rest.

**Metastable failure** — a self-sustaining overload state that persists after its trigger is gone.

**MTBF / MTTR** — mean time between failures / mean time to repair.

**N+k** — provisioning *k* spare units beyond what peak load needs.

**Outbox** — a table written in the same transaction as business state, later relayed to a broker.

**Partial synchrony** — timing model where delays are bounded *eventually*, enabling practical consensus.

**φ-accrual** — a failure detector that outputs continuous suspicion rather than a binary verdict.

**Poison message** — a message that deterministically fails processing.

**Quorum** — a subset of replicas large enough that any two such subsets overlap.

**ρ (rho)** — utilisation, \\( \lambda/\mu \\).

**RPO / RTO** — maximum tolerable data loss / maximum tolerable time to restore.

**Saga** — a long-running workflow of local transactions with forward or compensating steps.

**Shuffle sharding** — assigning each client a random small subset of workers to shrink blast radius.

**SLO / SLI** — target for a service level / the measured indicator.

**Split brain** — two parts of a system each believing they are the authoritative one.

**Unknown outcome** — a call whose result the caller cannot determine (timeout, reset).
