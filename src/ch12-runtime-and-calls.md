# Runtime and Calls

*Layers 3–4: the process, and the synchronous conversations between services.*

<div class="coldopen">

<span class="tag">Cold open · fictional on-call log</span>

```
10:31  ingestion pod: heap 45%, CPU 20%, GC normal. Latency 12 s.
10:33  thread dump: 198 of 200 request threads in socketRead() against "pricing-client".
10:34  pricing-client timeout config: none. (Library default: infinite.)
10:35  Pricing hung on one backend. Ingestion hung on pricing. Orders that need no pricing: hung too.
10:36  There was nothing wrong with ingestion. Except that it had no limit on how long to wait.
```

</div>

Layer 3 is the process: the runtime that executes your code. Layer 4 is the conversation between processes. Most "mysterious" production outages are one of them failing to bound something.

---

## Layer 3: Runtime

| | |
|---|---|
| **What fails** | GC pauses (a stop-the-world pause looks like a dead node); heap and native-memory leaks; thread- and connection-pool exhaustion; blocked event loops; deadlocks; cold-start and JIT warm-up slowness; file-descriptor exhaustion; unbounded queues; log I/O stalls; clock jumps |
| **Key question** | What are my **bounded resources**, and what happens at each bound? |
| **Math** | Little's Law for every pool and queue; the utilisation knee (Ch. 5); pause length versus lease and timeout (Ch. 7) |
| **See it** | Pool saturation, queue depth, GC pause histograms, thread states, FD counts, per-endpoint latency percentiles |

### Stance

**Everything has a bound and an overflow policy.** For every pool, queue, buffer, cache and retry counter, write down: *the limit, and what happens when it is hit* (reject, shed, or block with a timeout). An unbounded queue is an outage with delayed onset; a library default of "wait forever" is the same bug in disguise (the cold open).

**Never block a limited thread pool on a slow remote call.** Event-loop and I/O threads are few; one slow dependency can park them all. Use bounded, separate pools for blocking work.

**Fail fast on resource exhaustion.** A process that crashes and restarts in seconds usually serves users better than one that limps for minutes, *provided* restarts do not themselves cause a storm (Ch. 11).

**Warm up before taking full traffic.** Cold JIT, empty caches and unestablished connections make a fresh process slower than steady state. Ramp traffic in, and exclude cold instances from latency-sensitive paths.

**Make pauses harmless.** Since a pause can exceed any lease or timeout you set, correctness must never rely on "I was not paused." Fencing (Ch. 7) is the answer.

---

## Layer 4: Calls between services

| | |
|---|---|
| **What fails** | Timeouts, slow responses, errors whose *meaning* differs (retryable or not), partial responses, version/contract skew, thundering herds, cascading latency, retry storms, head-of-line blocking, unbounded fan-out |
| **Key question** | If this call fails or hangs, what happens to the *caller's caller*, and how much of my capacity is held while waiting? |
| **Math** | Series availability (Ch. 3); deadline budgeting, fan-out tails, Little's Law (Ch. 5); retry amplification \\( (r+1)^d \\) (Ch. 6) |
| **See it** | Per-dependency rate/errors/duration from the *caller's* view; retry ratio; in-flight counts; timeout-versus-error split; deadline-exceeded counts |

### Stance

**1. Classify every dependency.**

| Class | Meaning | Design |
|---|---|---|
| **Hard** | Cannot succeed without it | Minimise; protect; fail fast and clearly |
| **Soft** | Can degrade | Fallback with a defined quality (Ch. 3 utility) |
| **Async** | Can wait | Move off the synchronous path via a queue |

Moving a dependency from hard to soft to async is the cheapest availability gain you have.

**2. Propagate deadlines, not just timeouts.** Each hop receives the *remaining* time and never exceeds it.

**3. Retry at one layer, with a budget, with jitter, only when safe.** (Chapter 6.) *Safe* means the operation is idempotent or carries an idempotency key.

**4. Tell errors apart.** What the caller should do depends on what the error means:

| Class | Example | Action |
|---|---|---|
| Client error | 400, 404, 422 | **Do not retry** |
| Server error, definitely not executed | Connection refused, 503 from a shedder | Retry within budget, with backoff |
| **Unknown outcome** | Timeout, connection reset mid-request | Retry **only** if idempotent; otherwise reconcile |
| Throttled | 429 with `Retry-After` | Back off at least that long |

**5. Cap concurrency per dependency.** Size each cap with Little's Law so that even a *total stall* of that dependency cannot consume more than its share of your capacity. When the cap is hit, fail fast to the fallback. (This is a bulkhead plus a breaker, derived.)

**6. Make contracts compatible in both directions.** During rollouts, old and new versions coexist. Be a **tolerant reader** (ignore unknown fields), add before you remove, and never change a meaning in place (**expand → migrate → contract**).

**7. Bound fan-out.** A request that triggers an unbounded number of downstream calls is an overload attack waiting for a trigger.

> [!IMPORTANT]
> **The caller's view is the truth.** A dependency's own metrics say how *it* is doing. Only the caller's metrics say how *you* are doing. Alert on the latter.

## Checkpoint

<details>
<summary>1. A library has no default timeout. What's the minimum you must set?</summary>

A connect timeout, a per-request (read) timeout, and a total deadline derived from the caller's remaining budget. Also a pool-acquisition timeout, so waiting for a free connection is itself bounded.

</details>

<details>
<summary>2. A payment POST times out. Retry?</summary>

Only if it carries an idempotency key that the server enforces. Otherwise the outcome is unknown and a blind retry may double-charge; check status via a lookup or reconcile.

</details>

<details>
<summary>3. What makes a dependency "soft"?</summary>

A defined fallback that produces acceptable (if lower) value, *and* the business has agreed what that value is. Without the second part, "soft" is just a hope.

</details>

## Takeaways

- **Bound everything**: pools, queues, waits, retries. Library defaults are not a design.
- Never block scarce threads on slow remote calls.
- **Classify dependencies** hard/soft/async; demote wherever possible.
- **Deadlines propagate;** retries live at one layer; **errors have meaning**.
- **Cap per-dependency concurrency** from Little's Law.

<div class="notebook">

<span class="tag">Tessera notebook · entry 12</span>

**Dependency classes.** Datastore write: *hard*. Carrier-rate pricing: *soft* (cached tariff, marked as estimate). Billing, dispatch, notifications: *async* (event log).

**Client policy.** Connect timeout 1 s; per-attempt deadline derived from the caller; pool-acquire timeout 200 ms; per-dependency concurrency caps; errors classified per the table above.

</div>

**Next:** the layer where "at-least-once" lives. [Messaging](ch13-messaging.md).
