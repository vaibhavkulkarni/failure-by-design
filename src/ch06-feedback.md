# Feedback: How a Blip Becomes a Long Night

<div class="coldopen">

<span class="tag">Cold open · fictional on-call log</span>

```
09:00:00  deploy finishes; pods restart; caches cold for 8 seconds.
09:00:08  deploy complete. Cause of the slowness is GONE.
09:00:20  ingestion: 70% errors.            (load is unchanged: 70 req/s offered)
09:05:00  ingestion: 85% errors, retry traffic 3x normal.
09:30:00  rolled back the deploy. No change.
10:15:00  restarted all pods. 40 seconds of green, then red again.
11:10:00  paused the clients. Within 90 seconds: green, and stays green.
```

</div>

Read that log again. The trigger lasted eight seconds. The outage lasted two hours. **Something was sustaining it, and it was not the cause.** This is a *metastable failure*, and it is the most expensive kind.

## Retry amplification

<div class="derivation">

<span class="tag">Derivation · what retries cost</span>

**Question.** A call fails with probability \\( f \\) and the client makes up to \\( r \\) retries. How many attempts does one request cost on average?

**Assumptions.** Each attempt fails independently with probability \\( f \\). The client stops at the first success or after \\( r+1 \\) attempts.

**Derivation.**

1. Attempt 1 always happens.
2. Attempt 2 happens only if attempt 1 failed: probability \\( f \\). Attempt 3 only if the first two failed: \\( f^2 \\). In general attempt \\( i+1 \\) happens with probability \\( f^{\\,i} \\).
3. The expected number of attempts is the sum of the probabilities that each attempt happens (an expected *count* is a sum of probabilities): \\( S = 1 + f + f^2 + \cdots + f^r \\).
4. *Closed form.* Multiply by \\( f \\): \\( fS = f + f^2 + \cdots + f^{r+1} \\). Subtract: \\( S - fS = 1 - f^{r+1} \\), so

\\[ S = \frac{1-f^{\\,r+1}}{1-f} \\]

5. *Limits.* If \\( f \to 1 \\) every term tends to 1, so \\( S \to r+1 \\). If \\( f \\) is small, \\( S \approx 1+f \\): retries cost almost nothing when the system is healthy.
6. *Across layers.* Each attempt at layer 1 looks, to layer 2, like a brand-new request, which triggers layer 2's own \\( S \\) attempts. Multiplying down \\( d \\) layers:

\\[ S^{\\,d} \quad\longrightarrow\quad (r+1)^{d} \text{ when everything fails} \\]

7. *Budgets.* If total retries are capped at a fraction \\( b \\) of fresh requests, total attempts are at most \\( (1+b) \\) times fresh requests. Caveat: that holds only if the cap is **global** (one budget shared by the whole call chain). If every layer enforces its own cap, the caps multiply: \\( (1+b)^d \\).

**Reading the result.** It is multiplication, not addition. Each layer thinks it is being modestly persistent, but each of its attempts triggers the next layer's *whole* persistence routine:

```text
1 user request
├─ layer-1 attempt 1 ─┬─ layer-2 attempt 1
│                     ├─ layer-2 attempt 2
│                     └─ layer-2 attempt 3
├─ layer-1 attempt 2 ─┬─ ×3
└─ layer-1 attempt 3 ─┬─ ×3          →  9 calls reach the bottom service
```

Three attempts at each of three layers is \\( 3^3 = 27 \\) times the load on the bottom service at the exact moment it is struggling.

**Where it breaks.** Failures are not independent across attempts (a down dependency fails *every* attempt, which is the \\( f=1 \\) case), and clients with backoff spread retries over time rather than issuing them instantly.

</div>

<div class="widget" data-widget="retry"></div>

## The loop

Retries are a feedback loop: failures cause retries, and retries cause failures. Where does such a system settle? A deliberately simple model answers it exactly.

<div class="derivation">

<span class="tag">Derivation · fixed points of the retry loop (a toy model)</span>

**Question.** If the failure rate depends on load, and failures add load through retries, what load does the system settle at, and is it stable?

**Assumptions (simplified on purpose).**
(a) Fresh load is \\( \lambda \\); capacity is \\( C \\).
(b) \\( x \\) is the total load *now* (fresh plus retries).
(c) Failure probability \\( f(x) \\) is 0 up to capacity, rises linearly to 1 at \\( 2C \\): \\( f(x) = \min\\!\big(1, \max(0, (x-C)/C)\big) \\).
(d) Each fresh request that fails comes back as \\( r \\) retry attempts in the next round.

**Derivation.**

1. *Next round's load* is fresh load plus the retries from this round's failures: \\( g(x) = \lambda + \lambda f(x)\\,r = \lambda\big(1 + r\\,f(x)\big) \\).
2. The system **settles** where next round equals this round: \\( x = g(x) \\) (a *fixed point*).
3. *Solve piece by piece.* Let \\( \rho = \lambda/C \\).
   - For \\( x \le C \\): \\( f = 0 \\), so \\( g = \lambda \\) and \\( x = \lambda \\) is a fixed point if \\( \lambda \le C \\). **Healthy.**
   - For \\( C < x < 2C \\): \\( x = \lambda + \dfrac{\lambda r}{C}(x - C) \\). Collect the \\( x \\) terms: \\( x(1 - r\rho) = \lambda(1-r) \\), so \\( \bar{x} = \dfrac{\lambda(1-r)}{1-r\rho} \\). **A tipping point.**
   - For \\( x \ge 2C \\): \\( f = 1 \\), so \\( g = \lambda(1+r) \\) is constant, and \\( x = \lambda(1+r) \\) is a fixed point if it is at least \\( 2C \\). **Collapsed.**
4. *Numbers:* \\( \lambda = 70 \\), \\( r = 2 \\), \\( C = 100 \\) (so \\( \rho = 0.7 \\)): healthy at **70**; tipping point \\( 70(-1)/(1-1.4) = \mathbf{175} \\); collapsed at \\( 70\times3 = \mathbf{210} \\) (indeed \\( \ge 200 \\)).
5. *Stability.* Suppose the load sits slightly off a fixed point \\( \bar{x} \\), at \\( \bar{x}+\delta \\). To first order (a tangent-line approximation) \\( g(\bar{x}+\delta) \approx g(\bar{x}) + s\\,\delta = \bar{x} + s\\,\delta \\), where \\( s \\) is the slope of \\( g \\) at \\( \bar{x} \\). So each round multiplies the deviation by \\( s \\): after \\( n \\) rounds it is \\( s^{\\,n}\delta \\). It **shrinks if \\( s \\) is between \\( -1 \\) and \\( 1 \\)** and **grows otherwise**.
6. *Slopes here:* in the healthy and collapsed regions \\( g \\) is flat, so \\( s = 0 \\): **stable**. In the middle, \\( s = \lambda r/C = r\rho = 1.4 > 1 \\): **unstable**, a tipping point. A tipping point exists only when \\( r\rho > 1 \\), because only then does the middle slope exceed 1. At \\( \rho = 0.7 \\) that means \\( r > 1.43 \\).

**Reading the result.** The system has two stable resting states, healthy and collapsed, separated by a hill. A trigger that pushes the load across the hill leaves the system stuck in the collapsed state *after the trigger is gone*, because the retries alone sustain it. Iterating \\( x \to g(x) \\) by hand:

| Load right after the trigger | Successive rounds | Outcome |
|---|---|---|
| 130 | 130 → 112 → 87 → 70 | recovers in 3 rounds |
| 170 | 170 → 168 → 165 → 161 → … → 101 → 72 → 70 | recovers, slowly |
| 180 | 180 → 182 → 185 → 189 → 194 → 202 → 210 | **collapses**, stays at 210 |

A push of ten units across the hill decides the system's fate, and the 170 case limps home slowly: **the closer to the hill, the slower the recovery.**

```text
          hill (175)
            /\
 \         /  \         /
  \_______/    \_______/
 healthy (70)      collapsed (210)
```

**Where it breaks.** Real failure curves \\( f(x) \\) come from queues and timeouts, not a straight line, and real clients back off. The *logic* survives: wherever next-round load rises faster than this-round load (slope above 1), disturbances feed themselves.

</div>

Play with it. Start the load at 170, then at 180, and watch the blue path. Then set *Retries per failure* to 1: the second valley vanishes, because one retry per failure can never sustain a collapse at 70% load.

<div class="widget" data-widget="cobweb"></div>

## Play with it

Below is a deliberately simple model: a service with capacity 100/s, normal demand 70/s, and an 8-second trigger. Work that finishes after the client gave up is wasted, which is what makes overload self-sustaining. Toggle the protections.

<div class="widget" data-widget="meta"></div>

Things to try:

1. Turn **everything off**. The trigger ends at about second 23; the system never recovers. That is bistability.
2. Turn off *Clients retry*. It recovers by itself: the loop is gone.
3. Leave retries on and add the **Retry budget**. The loop's gain drops below 1.
4. Leave retries on and add **Load shedding**. The queue stays short, so no work is wasted.

> [!NOTE]
> The model is a teaching toy: a fluid queue, a hard timeout, capped retries. The *shape* of the result (two stable states, a trigger that is not the cause) is what real incidents show.

## Stability, in one idea

The derivation above generalises. Call the slope \\( s \\) the **loop gain**: *the extra load produced next round by one extra unit of load this round.*

- \\( s < 1 \\): disturbances die out. The system recovers by itself.
- \\( s \ge 1 \\): disturbances sustain or grow. The system needs outside help.

It is the microphone-and-speaker story. If the round trip makes the sound a little quieter each lap, the hum fades; if louder, a quiet cough becomes a screech that continues after the cough has stopped. Metastable failure is the screech; the trigger was the cough.

Every mechanism in this chapter either **lowers \\( s \\)** or **cuts the loop**. In the toy model \\( s = r\rho \\), so:

| Mechanism | Effect on the formula |
|---|---|
| Retry budget of \\( b = 10\% \\) | Replaces \\( r \\) by \\( b \\): \\( s = 0.1 \times 0.7 = 0.07 \\), far below 1 |
| Retrying at one layer only | Stops the \\( (r+1)^d \\) multiplication |
| Load shedding | Makes failures *cheap and bounded* so no work is wasted, so \\( f \\) never feeds on itself |
| Deadlines | Prevent work whose result will be discarded |
| Jittered backoff | Spreads retries across time, flattening the peak of \\( x \\) |

## A bestiary of loops

Look for these in your own system:

| Loop | How it feeds itself |
|---|---|
| **Retry storm** | Failures cause retries, retries cause failures |
| **Health-check ejection** | Slow pods fail probes, are removed, survivors take more load, become slow |
| **Autoscaler lag** | New pods start cold, steal CPU while warming, response slows, demand to scale grows |
| **Cache stampede** | Cache cold, every request goes to the database, database slows, timeouts, retry, cache stays cold |
| **Reconnect storm** | All clients reconnect at once after a blip, saturating the thing that just recovered |
| **Rebalance storm** | A slow consumer triggers a rebalance, all consumers pause, lag grows, slower consumers |
| **Breaker flapping** | Closes onto an unready backend, trips again, closes again |

## Breaking loops

| Mechanism | What it does to the loop |
|---|---|
| Retry budget, single retry layer | Caps gain |
| Exponential backoff **with jitter** | Spreads retries in time instead of synchronising them |
| Deadlines | Prevents work whose answer will be discarded |
| Admission control / shedding | Keeps the system left of the knee |
| Circuit breaking | Cuts the loop during the sick period |
| Warm-up and gradual traffic ramp | Prevents the recovery from being the next trigger |
| Brownout (turn off non-essential work) | Frees capacity so the system can drain |

> [!IMPORTANT]
> **Diagnosis signature of a metastable failure:** the trigger is gone but load or latency stays high, and *only reducing load, not fixing a bug*, brings recovery. In the cold open, pausing the clients worked; rolling back the deploy did not. When you see that pattern, **reduce load first, investigate second.**

<div class="rules">

<span class="tag">Rules of thumb</span>

1. **A retry is a loan against capacity you do not have.** The interest rate is \\( (r+1)^d \\).
2. **Retries per failure × utilisation above 1** means a collapse is possible (in the toy model).
3. The closer you are to the tipping point, the **slower** you recover, so slow recovery is itself a warning.
4. If load stays high after the trigger has gone, **cut load first**; no fix helps while the loop is feeding itself.
5. A retry budget of 10% caps amplification at 1.1×, however deep the stack, *if the budget is global*.

</div>

## Checkpoint

<details>
<summary>1. Why did restarting all the pods in the cold open give only 40 seconds of green?</summary>

Fresh pods start with empty queues, so the system briefly sat at the healthy point. But the retry backlog from clients hit the cold pods immediately, which pushed the system back to the collapsed point. A restart removes the *symptom's state* but not the *sustaining load*.

</details>

<details>
<summary>2. A team proposes "3 retries at the client, 3 at the gateway, 3 at the service". What is the worst-case amplification, and what is the fix?</summary>

\\( (3+1)^3 = 64\times \\) if everything fails. Retry at a single layer, preferably the one with the most context (usually the outermost, because it can propagate a deadline), and apply a global budget.

</details>

<details>
<summary>3. Why does jitter matter even with exponential backoff?</summary>

Backoff alone still synchronises clients that failed at the same instant: they all retry at \\( t+1 \\), \\( t+2 \\), \\( t+4 \\) together. Jitter randomises those instants, turning spikes into a smear the system can absorb.

</details>

## Takeaways

- Retries multiply: \\( (r+1)^d \\). **Budget them globally**, retry at one layer.
- Feedback creates **bistability**: a healthy state and a collapsed one, with the collapsed one self-sustaining.
- Judge stability by **loop gain**; recovery tools **lower G** or **cut the loop**.
- In a metastable failure, **reduce load first**.

<div class="notebook">

<span class="tag">Tessera notebook · entry 6</span>

**Retry policy.** Retries happen only at the client SDK and at ingress for idempotent calls, with a budget of 10% of base traffic, jittered exponential backoff, and `Retry-After` hints on every shed response. Services in between never retry.

**Runbook line #1 for any overload page:** *reduce offered load (pause batch, slow clients, shed), then diagnose.*

</div>

**Next:** when something stops responding, how do we decide it is dead, and who is in charge? [Knowing What Is Dead](ch07-knowing-what-is-dead.md).
