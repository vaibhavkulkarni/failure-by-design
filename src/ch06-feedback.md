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

A client that retries a failing call adds load to the thing that is failing. With up to \\( r \\) retries and per-call failure probability \\( f \\), the expected number of attempts per request at one layer is

\\[ \sum_{i=0}^{r} f^{\\,i} \quad\xrightarrow{\\;f\to 1\\;}\quad r+1 \\]

If \\( d \\) layers each retry independently, the worst case multiplies:

\\[ (r+1)^{d} \\]

<div class="widget" data-widget="retry"></div>

Three attempts per layer across three layers is **27×** load on the bottom service at the exact moment it is struggling. The cure is arithmetic, not folklore: **a global retry budget**. If retries may not exceed a fraction \\( b \\) of base traffic, amplification is capped at \\( 1 + b \\), whatever the depth.

## The loop

Let \\( \lambda \\) be the fresh load, and \\( \lambda_{\text{eff}} \\) the effective load including retries. If the failure probability grows with effective load, \\( f(\lambda_{\text{eff}}) \\), then roughly:

\\[ \lambda_{\text{eff}} = \lambda\\,\big(1 + r\\, f(\lambda_{\text{eff}})\big) \\]

This is a **fixed-point equation**: the system settles where the load it is offered equals the load its own failures generate. When \\( f \\) is flat at low load and steep near saturation, there can be **two** stable solutions:

- a **healthy** point: low failure, little retry traffic;
- a **collapsed** point: high failure, so much retry traffic that failure stays high.

A transient trigger (deploy, GC storm, blip, cache flush) can knock the system from the first point to the second, and then **it stays there after the trigger has gone**, because the retries alone hold up the load.

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

Think of the system as a loop with **gain** \\( G \\): the extra load produced next round by one unit of load this round.

- \\( G < 1 \\): disturbances die out. The system recovers by itself.
- \\( G \ge 1 \\): disturbances sustain or grow. The system needs outside help.

Every mechanism in this chapter either **lowers G** or **cuts the loop**.

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
