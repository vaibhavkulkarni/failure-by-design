# Ground, Wire, and Platform

*Layers 0–2: infrastructure, network, and the orchestration platform.*

<div class="coldopen">

<span class="tag">Cold open · fictional on-call log</span>

```
22:10  Carrier-rate API has a 90-second blip.
22:11  Ingestion liveness probe calls /health, which checks the carrier API. It fails.
22:12  Orchestrator restarts every ingestion pod, in all three clusters, in 40 seconds.
22:13  Cold JVMs, empty caches, connection pools at zero. Traffic hits all of them.
22:25  The carrier API recovered at 22:12. Tessera did not, until 22:41.
```

</div>

The third-party outage lasted ninety seconds. Tessera's *own platform*, trying to help, turned it into half an hour. The pattern repeats across the bottom three layers: **automatic recovery machinery is itself a source of failure.**

> [!NOTE]
> For every layer in Part IV, the same five questions apply: *what fails, what is the key question, which math applies, what stance follows, how do I see it?*

---

## Layer 0: Ground (physical and cloud infrastructure)

| | |
|---|---|
| **What fails** | Node, rack, zone, data centre, region; storage devices; power and cooling; quota and capacity exhaustion; a bad firmware or hardware batch hitting many nodes at once |
| **Key question** | What are my **fault domains**, and which components share each? |
| **Math** | Series / parallel / k-of-n **with β** (Ch. 3–4); N+k capacity at the *domain* level (Ch. 5) |
| **Stance** | Spread replicas across **independent** domains; keep headroom for losing a *whole domain*, not a node; avoid global singletons; treat **quota** as a dependency |
| **See it** | Capacity trend, per-domain skew, quota headroom, hardware error rates |

Hardware faults tend to be the *least* surprising layer because the failure model (crash-stop) is well understood. The traps are **correlation** (one rack, one batch, one firmware) and **capacity** (losing a domain pushes the survivors over the knee).

## Layer 1: Wire (network and transport)

| | |
|---|---|
| **What fails** | Loss, latency spikes, reordering, duplication; **asymmetric partitions** (A→B works, B→A does not); DNS failure or staleness; **TLS handshake and certificate expiry**; connection resets; NAT/conntrack exhaustion; half-open connections; MTU black holes |
| **Key question** | When this connection dies mid-request, *did the request execute*? |
| **Math** | Unknown outcome (Ch. 2); detector accuracy (Ch. 7); latency tails (Ch. 5) |
| **Stance** | Assume every call can end in **unknown outcome**; separate **connect** from **request** timeouts; use keep-alive and **bounded connection lifetimes** (so load rebalances); give DNS and certificates their own SLOs and expiry alerts |
| **See it** | Per-path RTT and loss, retransmits, handshake errors, **time-to-expiry of every certificate** |

Two details are worth highlighting.

- **Connection lifetime.** A connection that lives forever pins load to old endpoints and survives topology changes badly. A bounded lifetime with jitter spreads load and lets clients notice change.
- **Different timeouts for different questions.** "Can I establish a connection?" should have a *short* timeout (the answer is usually fast). "Will the server finish this request?" depends on the operation. One number for both will be wrong for one of them.

## Layer 2: Platform (Kubernetes/OpenShift and service mesh)

| | |
|---|---|
| **What fails** | Eviction and preemption; OOM kills; **CPU throttling**; node drains; image-pull failures; **probe misconfiguration**; autoscaler oscillation; control-plane (API server, etcd) degradation; ingress/router failure; sidecar crash or version skew; **mesh control-plane loss**; cluster DNS overload; quota surprises; disruption-budget deadlocks during upgrades |
| **Key question** | What does the platform do *automatically* when it detects a problem, and **can that action create a feedback loop**? |
| **Math** | Control-loop stability, loop gain (Ch. 6); Little's Law for per-pod capacity (Ch. 5); startup time inside recovery drain (Ch. 5) |
| **See it** | Restarts, OOM kills, throttled periods, pending pods, probe failure rate, control-plane latency, endpoint churn |

### Stance

**1. Probes answer different questions.**

| Probe | Question | Should depend on |
|---|---|---|
| **Liveness** | "Is this process wedged beyond recovery?" | **Only the process itself.** Never a downstream service. |
| **Readiness** | "Should this pod receive traffic right now?" | Local ability to serve (warm, connected), *not* every dependency |
| **Startup** | "Has it finished booting?" | Long boot sequences, so liveness does not kill slow starters |

The cold open broke the first rule. A liveness probe that depends on a downstream turns every downstream outage into a restart storm, and restarts are *load*, not healing.

**2. CPU limits can create latency.** A CPU quota enforced in short windows throttles a busy process even when *average* utilisation looks low. Set requests and limits from measurement, and watch the throttling counters, not just CPU percent.

**3. Make startup fast and predictable.** Recovery speed bounds MTTR (Ch. 3), and the backlog that accumulates during a restart wave drains at \\( T\rho/(1-\rho) \\) (Ch. 5).

**4. Drain gracefully.** On shutdown, stop receiving new work, finish in-flight requests, then exit. Without it every deploy is a tiny outage: requests that were mid-flight get reset.

**5. The data plane must outlive the control plane.** If the mesh's control plane fails, proxies should keep working with their last-known configuration (**fail static**). Ask of every control plane: *if it is gone for an hour, does traffic still flow?*

**6. Spread, and allow upgrades.** Use topology spread across domains, and disruption budgets that protect availability *without* making upgrades impossible.

**7. Autoscalers are feedback loops.** A new pod is *less* capable than an old one while warming. Scaling on a lagging metric, or scaling aggressively during overload, can add load before it adds capacity (Ch. 6). Prefer predictive or conservative scale-up, a warm-up ramp, and a floor.

> [!WARNING]
> **Pitfall: health as a vote on dependencies.** The more you couple a pod's health to the world around it, the more correlated your restarts become. Health should describe *this pod*; dependency health belongs in separate signals and in degraded-mode logic.

## Checkpoint

<details>
<summary>1. What should Tessera's liveness probe check?</summary>

That the process can respond at all (event loop or worker threads not wedged), possibly with a trivial in-process check. Not the database, not the broker, not the carrier API.

</details>

<details>
<summary>2. A pod shows 40% average CPU but latency spikes every few hundred milliseconds. First hypothesis?</summary>

CPU throttling from a quota (bursts exhaust the quota within a scheduling period). Check the container's throttled-time counters, then reconsider limits or request sizing.

</details>

<details>
<summary>3. Name two ways automated recovery can worsen an incident.</summary>

Restart storms (synchronised cold starts), failover that concentrates load on fewer nodes, autoscaling that adds cold capacity during overload, health-check ejection that removes capacity from an already saturated pool.

</details>

## Takeaways

- Know your **fault domains**; budget capacity for losing a *domain*.
- Treat **DNS, certificates and quotas** as dependencies with their own failure modes.
- **Liveness is about the process, not the world.**
- **Automatic recovery is a feedback loop**: analyse its gain.
- Control planes must **fail static**; shutdowns must **drain**.

<div class="notebook">

<span class="tag">Tessera notebook · entry 11</span>

**Rows added to the fault matrix:** node/zone loss · asymmetric partition · expired certificate · DNS stall · CPU throttling · restart storm · mesh control-plane loss · autoscaler lag.

**Rules:** liveness is process-only; readiness is local; connection lifetimes bounded and jittered; graceful drain on every shutdown; certificate time-to-expiry alerts at 30, 14 and 7 days.

</div>

**Next:** inside the process, and on the call between processes. [Runtime and Calls](ch12-runtime-and-calls.md).
