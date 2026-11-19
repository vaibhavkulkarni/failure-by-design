# D. Further Reading

## Foundations
- Avizienis, Laprie, Randell, Landwehr — *Basic Concepts and Taxonomy of Dependable and Secure Computing* (fault, error, failure).
- Fischer, Lynch, Paterson — *Impossibility of Distributed Consensus with One Faulty Process* (FLP).
- Dwork, Lynch, Stockmeyer — *Consensus in the Presence of Partial Synchrony*.
- Gilbert, Lynch — the formal proof of the CAP conjecture; Abadi — *PACELC*.

## Coordination and consistency
- Hellerstein, Alvaro — *Keeping CALM: When Distributed Consistency Is Easy*.
- Bailis et al. — *Coordination Avoidance in Database Systems* (invariant confluence).
- Shapiro et al. — *Conflict-Free Replicated Data Types* (ACI in data structures).
- Kleppmann — *Designing Data-Intensive Applications* (faults, consistency, consensus; the fencing-token discussion).

## Detection and gray failure
- Chandra, Toueg — *Unreliable Failure Detectors for Reliable Distributed Systems*.
- Hayashibara et al. — *The φ Accrual Failure Detector*.
- Huang et al. — *Gray Failure: The Achilles' Heel of Cloud-Scale Systems*.

## Latency, queues, feedback
- Dean, Barroso — *The Tail at Scale*.
- Harchol-Balter — *Performance Modeling and Design of Computer Systems* (queueing theory for engineers).
- Bronson et al. — *Metastable Failures in Distributed Systems*; Huang et al. — *Metastable Failures in the Wild*.

## Practice
- Google — *Site Reliability Engineering* and *The Site Reliability Workbook* (SLOs, burn-rate alerting, cascading failures).
- Amazon Builders' Library — articles on timeouts, retries and backoff, static stability, shuffle sharding.
- Basiri et al. — *Chaos Engineering*; the principles at principlesofchaos.org.
- Lamport — *Specifying Systems* (TLA+).

> [!NOTE]
> References are given by title and author so you can find the current canonical versions; this book intentionally does not reproduce their text.
