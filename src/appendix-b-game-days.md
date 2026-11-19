# B. Game Day Workbook

Six scenarios you can run against any system that resembles Tessera. For each: the **hypothesis**, the **injection**, what to **watch**, when to **abort**, and what to **ask** in the debrief. Always run with a bounded blast radius and a rollback plan.

> [!WARNING]
> Run these first in a non-production or canary environment. Move to production traffic only when a scenario passes repeatedly and abort automation is proven.

---

## 1. Lose a cluster at peak

- **Hypothesis:** with one of three clusters drained, acknowledgement availability stays ≥ 99.9% and p99 stays within the latency SLO; no invariant violations.
- **Inject:** drain traffic and pods from one cluster at peak load.
- **Watch:** survivor utilisation (expect 1.5×), connection-pool saturation, queue depth, lag growth, error budget burn.
- **Abort:** burn rate above 10 for two minutes, or any S1/S2 violation.
- **Debrief:** Which pool or limit saturated first? What was ρ steady-state? How long to return to normal after restoring the cluster (drain time)?

## 2. Gray dependency

- **Hypothesis:** if one of three endpoints of a soft dependency hangs for 30 s, user-visible errors stay below 1% and the endpoint is ejected within 10 seconds.
- **Inject:** make one upstream endpoint accept connections and never respond.
- **Watch:** caller-side per-endpoint outcomes, in-flight counts, fallback rate, health-probe status (which should stay *green*, to prove why callers' view matters).
- **Abort:** error rate above 5%.
- **Debrief:** How long did detection take? Did any thread pool saturate? Did the fallback produce an honest "estimated" marker?

## 3. Retry-storm trigger

- **Hypothesis:** an 8-second 2× traffic spike with clients retrying does **not** cause a sustained collapse.
- **Inject:** spike load while the dependency slows 5×; then remove both.
- **Watch:** offered load versus goodput, retry ratio, queue depth after the trigger ends.
- **Abort:** goodput below 30% of demand for 60 seconds after the trigger.
- **Debrief:** If it collapsed, what lowered G? (Budget? Shedding? Jitter?) Does your runbook say "reduce load first"?

## 4. Duplicate and replay

- **Hypothesis:** delivering every message twice, then replaying 36 hours of history, produces no duplicate effects.
- **Inject:** duplicate messages in the stream; reset a consumer group's offsets to a past time.
- **Watch:** S1 checker (effects per key), dedup-hit rate, DLQ rate, downstream call volume.
- **Abort:** any S1 violation.
- **Debrief:** What is the actual dedup window versus the replay horizon? Is the re-drive rate-limited?

## 5. Pause the leader

- **Hypothesis:** a 60-second pause (STOP signal) of the single-active relay produces no duplicate publication after failover, and the paused process stops acting once resumed.
- **Inject:** `SIGSTOP` the leader beyond its lease; allow failover; `SIGCONT`.
- **Watch:** fencing-token rejections at the store, duplicate counters, time to resume work.
- **Abort:** any duplicate effect.
- **Debrief:** Does the *resource* verify the token? If not, what protects it?

## 6. The expiring credential

- **Hypothesis:** rotating or expiring a certificate or client secret in one cluster causes no user-visible errors; expiry in all clusters is detected at least seven days earlier.
- **Inject:** shorten a certificate's validity in a test cluster; revoke a token issuer endpoint for five minutes.
- **Watch:** handshake failures, token-refresh behaviour (herd or jitter?), time-to-expiry alerts, independent probe results.
- **Abort:** sustained handshake failure in the canary.
- **Debrief:** Are lifetimes staggered across clusters? Does break-glass access work *without* the failing system?

---

## Debrief template

```text
Scenario:                       Date:                   Participants:
Hypothesis held?  Y / N         Surprises:
Timeline          detect ___  diagnose ___  decide ___  act ___  verify ___
Matrix updates (rows added/changed):
Estimates updated (λ, MTTR, β, ρ):
Detectors added or fixed:
Runbook changes:
Follow-ups (owner, date):
```
