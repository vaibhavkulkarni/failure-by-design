# The Physics You Cannot Escape

<div class="coldopen">

<span class="tag">Cold open · fictional on-call log</span>

```
11:02  Harbor's client: POST /orders  (idempotency-key: h-77412)  ... no response after 2s.
11:02  Harbor's client: timeout. Did the order land? Unknown.
11:02  Harbor's client: retry, same key.
11:02  Ash ingestion: first request actually committed at 11:02:01.9. Response was in flight.
11:02  Birch ingestion: second request arrives. Has Ash's commit replicated yet? ...
11:03  support: "Harbor says they sent it once. We have two. Or one. Depends which screen."
```

</div>

Harbor's client did nothing wrong. It could not have known. Between "I sent a request" and "I received a response" lies a gap that no engineering can close, and *every mechanism in this book lives in that gap*.

## The Two Generals problem

Two armies must attack together. Each can only message the other through hostile territory where messengers can be captured. General A sends "attack at dawn." Did B get it? A needs an acknowledgement. But then B wonders whether *the ack* arrived, and needs an ack of the ack… and so on forever.

**No finite protocol gives both sides certainty.** Translated: *over an unreliable channel, the sender of a request can end up not knowing whether it was executed.* That state ("unknown outcome") is not a bug in your client library. It is physics.

Consequence: **exactly-once delivery is impossible in general.** What you *can* build is exactly-once *effect* from *at-least-once delivery + idempotent processing* (Chapter 8).

## FLP: the cost of "maybe dead"

In 1985 Fischer, Lynch and Paterson proved the most quoted and least understood result in distributed systems. It says that **in a fully asynchronous system, no deterministic protocol can guarantee that a group of processes reaches agreement if even one of them might crash.** Because the one-line version invites misreadings, we take it slowly: the setting, the squeeze, the proof in four moves, what it does *not* mean, and how real systems live with it.

### The setting: what "asynchronous" means

**Consensus** is the problem of getting a group of processes to agree on one value. Each starts with an input (say, commit or abort) and must *decide*. A correct protocol must give three guarantees:

| Property | Meaning | Kind (Chapter 1) |
|---|---|---|
| **Agreement** | No two processes decide differently | Safety |
| **Validity** | The decided value was some process's input | Safety |
| **Termination** | Every non-crashed process eventually decides | Liveness |

The model FLP studies is called **asynchronous**, and its assumptions are precise:

1. **No bound on message delay.** A message sent is *eventually* delivered (none is lost), but it may take arbitrarily long.
2. **No bound on relative speed.** One process may run arbitrarily slower than another.
3. **No usable clocks or timeouts.** A process cannot conclude anything from "I have waited a long time".
4. **Deterministic processes.** Same inputs and same messages always produce the same behaviour.
5. **At most one process may crash**, unannounced and permanently.

Assumptions 1 to 3 together have one consequence: **a very slow process and a dead process look exactly the same from outside.** That is the whole engine of the proof.

### The squeeze: wait or decide?

Three replicas, A, B and C, must agree whether to commit order O-77. A votes *commit* and B votes *abort*. C's vote is the tie-breaker: whichever way it goes decides the outcome. A and B have asked C and are waiting. C's reply has not arrived. What can A and B do?

| Option | If C is actually dead | If C is actually alive but slow |
|---|---|---|
| **Keep waiting** | Wait forever: *termination* fails | Fine, eventually the vote arrives |
| **Decide without C** (say, abort) | Fine | C may already have decided *commit* using other messages: *agreement* fails |

A and B cannot tell the two rows apart, so **every strategy risks either never finishing or disagreeing**. FLP generalises this squeeze: it shows that a scheduler controlling only *when messages arrive* can keep any deterministic protocol in such a position forever.

### The theorem, precisely

> [!IMPORTANT]
> **FLP.** In an asynchronous system with reliable (but arbitrarily slow) message delivery, where at most one process may crash, **no deterministic consensus protocol is guaranteed to terminate** in every execution, even though every process may be correct and no message is ever lost.

Notice what it does not need: lost messages, many failures, or any process actually crashing. It only needs the *possibility* of a crash and the freedom to delay messages.

### The proof in four moves

We give the proof's structure, which is short once the vocabulary is in place. A **configuration** is a snapshot of every process's state plus all messages in flight. A single **step** delivers one message to one process, which updates its state and may send new messages. A configuration is:

- **0-valent** if every way of continuing leads to a decision of 0;
- **1-valent** if every way leads to 1;
- **bivalent** if both outcomes are still possible.

A bivalent configuration is *undecided*: the future could still go either way. The proof shows the system can be kept bivalent forever.

<div class="derivation">

<span class="tag">Move 1 · some starting point is undecided</span>

**Claim.** At least one starting configuration (an assignment of inputs) is bivalent.

**Derivation.**

1. By validity, the all-0 start must decide 0 (it is 0-valent) and the all-1 start must decide 1 (1-valent).
2. Change the inputs one process at a time from all-0 to all-1. This gives a chain of starting configurations in which neighbours differ in exactly one process's input. The chain begins 0-valent and ends 1-valent, so somewhere there is a neighbouring pair \\( S_0 \\), \\( S_1 \\), differing only in process \\( p \\)'s input, with \\( S_0 \\) 0-valent and \\( S_1 \\) 1-valent (otherwise a bivalent one already exists and we are done).
3. Now suppose \\( p \\) crashes before taking any step, which is allowed. The protocol must still terminate, so the *other* processes decide by some sequence of steps \\( \sigma \\) that never involves \\( p \\).
4. The others cannot see \\( p \\)'s input (it never speaks), so \\( \sigma \\) behaves identically from \\( S_0 \\) and \\( S_1 \\) and reaches the **same** decision \\( v \\).
5. But \\( S_0 \\) can only ever decide 0 and \\( S_1 \\) only 1. So \\( v \\) would have to be both. Contradiction, so a bivalent start exists.

**In plain words.** One process's input can swing the outcome, and the others cannot tell whether that process is dead or just quiet.

</div>

<div class="derivation">

<span class="tag">Move 2 · independent steps commute</span>

**Claim.** If two steps happen at *different* processes, applying them in either order gives the same configuration.

**Why.** They read and change different process states and consume different messages, so neither affects the other. This lets the scheduler reorder independent deliveries without anyone being able to notice, and it is the tool Move 3 uses.

</div>

<div class="derivation">

<span class="tag">Move 3 · a bivalent system can always stay bivalent</span>

**Claim.** Take a bivalent configuration \\( C \\) and any pending message \\( m \\) addressed to process \\( p \\). The adversary can first deliver some other messages, and then deliver \\( m \\), and land in a configuration that is *still bivalent*.

**Derivation (by contradiction).**

1. Let \\( \mathcal{E} \\) be every configuration reachable from \\( C \\) *without* delivering \\( m \\). Suppose delivering \\( m \\) from every configuration in \\( \mathcal{E} \\) gave only univalent results.
2. Because \\( C \\) is bivalent, both a 0-valent and a 1-valent result must occur. So somewhere there are two neighbouring configurations \\( D_0 \\) and \\( D_1 \\) in \\( \mathcal{E} \\), where \\( D_1 \\) is one step \\( e \\) after \\( D_0 \\), such that delivering \\( m \\) from \\( D_0 \\) is 0-valent and from \\( D_1 \\) is 1-valent.
3. **Case A: the step \\( e \\) is at a different process than \\( p \\).** By Move 2, "\\( e \\) then \\( m \\)" and "\\( m \\) then \\( e \\)" reach the same configuration. But "\\( m \\) from \\( D_0 \\)" is already 0-valent, so everything reachable from it, including "\\( m \\) then \\( e \\)", is 0-valent. Yet that configuration equals "\\( m \\) from \\( D_1 \\)", which was 1-valent. Contradiction.
4. **Case B: the step \\( e \\) is at \\( p \\) itself.** Let \\( p \\) crash. The others must still decide, by some \\( \sigma \\) not involving \\( p \\). Because \\( p \\) never moves in \\( \sigma \\), it can be run from *both* "\\( m \\) from \\( D_0 \\)" and "\\( m \\) from \\( D_1 \\)" and the others see the same thing, so both reach the same decision. But one was 0-valent and the other 1-valent. Contradiction.
5. Both cases fail, so some way of delivering \\( m \\) keeps the system bivalent.

**In plain words.** Whatever message the fairness rules force us to deliver next, there is always a way to arrange the order of other deliveries so that this one is not yet decisive.

</div>

<div class="derivation">

<span class="tag">Move 4 · the endless schedule</span>

1. Start from the bivalent configuration of Move 1. Keep a queue of all processes, and take them in turn.
2. At each stage, give the process at the front of the queue its oldest pending message (or "no message" if it has none), using Move 3 to arrange the deliveries so the system stays bivalent. Then send that process to the back of the queue.
3. Every process gets infinitely many turns, and every message is eventually delivered, so this is a **perfectly legal** asynchronous execution. **Nobody crashed. No message was lost.**
4. Yet the configuration is bivalent at every stage, so **no process ever decides**. Termination fails.

**In plain words.** The adversary never breaks anything. It only chooses *when* messages arrive, and it always finds a delivery order that leaves the outcome open.

</div>

Notice where the single crash was used: in Move 1 and in Case B of Move 3, we invoked "suppose \\( p \\) is silent, the others must still decide". Remove that possibility and consensus is easy (just wait to hear from everyone). **The mere possibility of one silent process is what makes agreement unguaranteeable.**

### What FLP does *not* say

| Misreading | Reality |
|---|---|
| "Consensus is impossible." | Only *guaranteed termination* is impossible, for *deterministic* protocols in a *fully asynchronous* model. |
| "Paxos and Raft are broken." | They never violate safety. They may fail to make progress during bad timing (for example, two candidates repeatedly stealing each other's election), and they rely on timing assumptions to make progress in practice. |
| "You can't build reliable systems." | You can build systems that are **always safe and usually live**, which is what you want. |
| "It is about lost messages." | No message is lost in the model; they are only delayed. (Two Generals is the lossy-channel problem.) |
| "It needs several failures." | One possible crash is enough. |

### Two Generals versus FLP

Both say "you cannot know", but they are different impossibilities:

| | Two Generals | FLP |
|---|---|---|
| Channel | Messages can be **lost** | Messages are reliable but **arbitrarily slow** |
| Failures | None needed | One possible crash |
| What cannot be achieved | Common knowledge that a message arrived | Guaranteed termination of consensus |
| Practical moral | Every request can end in *unknown outcome* | Agreement protocols can *stall*, never lie |

### How real systems live with it: three doors

FLP is a theorem about a specific model, so every escape *changes the model or weakens the guarantee*. There are three well-known doors, each spending one of the four currencies.

| Door | Idea | Spends | Examples |
|---|---|---|---|
| **Partial synchrony** (Dwork, Lynch, Stockmeyer, 1988) | Assume that after some unknown moment, message delays and process speeds become bounded. Safety **never** depends on this; progress does. | Time and information (timeouts) | Raft, Paxos with leader election, Zab |
| **Randomization** (Ben-Or, 1983) | Let processes flip coins. The adversary cannot predict them, so it cannot keep the system bivalent forever. Termination holds with probability 1, not in bounded time. | Semantics (probabilistic liveness) | Randomised election timeouts; Ben-Or-style protocols |
| **Failure detectors** (Chandra and Toueg, 1996) | Add an oracle that *eventually* suspects crashed processes accurately. With a majority of correct processes, consensus becomes solvable. | Information | Heartbeat timeouts (Chapter 7) |

The practical shape of partial synchrony:

```text
time ──────────────────────────────────────────────────────────────►
 [ chaos: delays unbounded, elections may keep failing ]  │ [ delays bounded: a leader emerges, decisions flow ]
 safety holds throughout                                  │ safety holds, liveness returns
                                                    "stabilisation"
```

### What this means for Tessera

1. **A consensus-backed component can stall without any node being dead.** A datastore leader election, a config store or a lock service can lose liveness under slow networks or long pauses. Design the stall: queue, shed, or serve degraded reads. Do not assume instant failover.
2. **Never trade safety for liveness silently.** A "force a leader" or "skip the quorum" switch deliberately gives up agreement. Make it a documented, audited break-glass action, not a tuning knob.
3. **Leadership flapping is the symptom of being on the wrong side of "stabilisation".** Timeouts that are too tight for the real delay distribution keep the system in the chaotic phase. Alert on election counts and tune timeouts to measured tail latency (the φ reasoning of Chapter 7).
4. **Randomised timeouts are not decoration.** They are the randomization door, preventing candidates from colliding forever.
5. **Do not write your own consensus.** Use a proven implementation, and test it under injected delay and pauses (Chapter 17).

## CAP and PACELC, put to use

During a network partition, a replicated store must choose between **consistency** (refuse some requests) and **availability** (answer, possibly with stale or divergent data). When there is *no* partition, it still trades **latency** against **consistency**. These are not slogans for architecture diagrams. They are *per-operation* decisions:

- "Create an order": we must not lose it (S2). During a partition, accept writes in each cluster and reconcile? Or refuse in the minority side?
- "Show order status": a few seconds of staleness is fine.

## CALM: where coordination is actually needed

The CALM theorem says a computation can be made coordination-free **if and only if it is monotonic**: information only accumulates, and nothing is retracted. Adding items to a set is monotonic. "Balance must never go below zero" is not, because two concurrent withdrawals can each look fine alone.

This gives you a practical filter. For each invariant, ask: *can two replicas each preserve it independently and still preserve it when merged?* (Researchers call this being **invariant-confluent**.)

| Invariant | Coordination-free? | Why |
|---|---|---|
| "Every order has a unique ID" | Yes, if IDs are generated node-independently | No two writers can pick the same value |
| "No duplicate effect for one idempotency key" | **No** | Two clusters could both accept the key; needs a unique-constraint point |
| "Status only moves forward" | Yes | Monotonic progress |
| "Inventory never goes negative" | **No** | Concurrent decrements break it |

> [!TIP]
> Coordination is where availability goes to die. Spend it only on invariants that fail the test, and nowhere else.

## The derivation chain

Here is the most valuable page in the book. Read it as a story, then notice that each line forces the next.

```
Networks can delay, drop, duplicate and reorder messages        (fact)
  → cannot tell slow from dead                                   (Two Generals / FLP)
    → must use timeouts to make progress                         (we want liveness)
      → timeouts produce false positives                         (slow ≠ dead)
        → an operation may or may not have executed              (unknown outcome)
          → we retry or reconcile                                (restore liveness)
            → retries create duplicates                          (safety risk)
              → need idempotency, dedup, fencing                 (restore safety)
            → retries add load                                   (amplification)
              → need budgets, deadlines, shedding                (restore stability)
          → if we can't retry safely                             (still unknown)
            → need reconciliation, sagas, audits                 (eventual correctness)
```

Every "pattern" you know is a line on this chart. Timeouts, retry budgets, idempotency keys, fencing tokens, sagas: all consequences. If you can regenerate the chart from memory, you do not need to memorise the patterns.

## The four currencies

Every tolerance mechanism *spends* something. Naming the currency makes trade-offs visible.

| Currency | You spend | Buys you | Examples |
|---|---|---|---|
| **Space** | More copies, spare capacity | Survives crashes | Replicas, clusters, headroom |
| **Time** | Latency, waiting, retries | Survives transient faults | Timeouts, retry, hedging, buffering |
| **Information** | Metadata, acks, observability | Detection, dedup, ordering | Heartbeats, idempotency keys, fencing tokens |
| **Semantics** | A weaker guarantee | Survives partition and overload | Stale reads, degraded modes, partial results |

You will see later that each currency has a way of going bankrupt: space fails under *correlation*, time fails under *saturation*, information fails under *silent* faults, and semantics fails if you relaxed the wrong invariant.

## Checkpoint

<details>
<summary>1. Harbor timed out and retried with the same key. What two outcomes must the server handle correctly?</summary>

(a) The first attempt *did* commit: the retry must return the original result without creating a second order. (b) The first attempt did *not* commit: the retry must create it exactly once. The server cannot tell which case it is in without looking up the key atomically with the write.

</details>

<details>
<summary>2. Why can't a bigger timeout fix unknown outcomes?</summary>

A longer timeout lowers the *probability* that you give up too early but never removes it, and it costs latency and held resources. The uncertainty is structural, so the fix must be in the protocol (idempotency, reconciliation), not the constant.

</details>

<details>
<summary>3. Classify: "an order's status may only advance from created → priced → dispatched."</summary>

Monotonic (status only moves forward) and therefore coordination-free *if* updates are expressed as "advance to at least X" rather than "set to X." Concurrent writers cannot break it.

</details>

<details>
<summary>4. In the FLP adversary's schedule, what does it control and what can it not do?</summary>

It controls only the *timing and order* of message deliveries (and which process steps next). It cannot lose a message, corrupt one, or crash anyone, and it must eventually deliver every message and give every process turns. The run is a legal asynchronous execution in which nothing is broken, yet nobody ever decides.

</details>

<details>
<summary>5. Why does FLP not refute Raft?</summary>

Raft's *safety* never depends on timing, so FLP cannot touch it. Its *liveness* assumes that delays eventually become bounded (partial synchrony) and uses randomised election timeouts, which are exactly the escapes FLP leaves open. During bad periods Raft can stall; it does not disagree.

</details>

<details>
<summary>6. A peer's heartbeat is 3 seconds late. Which two options does the squeeze leave you, and how do you make the "declare it dead" option safe if you are wrong?</summary>

Keep waiting (risking no progress) or declare it dead and proceed (risking that it is alive and acts too). To make the second safe, fence the resource: give the new owner a higher token so that a wrongly declared-dead node's later actions are rejected (Chapter 7).

</details>

## Takeaways

- You cannot distinguish **slow** from **dead**, so every call can end in **unknown outcome**.
- "Exactly-once" means **at-least-once + idempotent effect**, built, not provided.
- Use **CALM** to find which invariants need agreement; coordinate only for those.
- **FLP:** with even one *possible* crash and unbounded delays, no deterministic protocol can *guarantee* agreement terminates. An adversary that only delays messages can keep the outcome undecided forever. Real systems stay **safe always** and buy **liveness** with timing assumptions (partial synchrony), randomness or failure detectors.
- The **derivation chain** generates the patterns; learn the chain, not the catalogue.
- Every mechanism spends **space, time, information or semantics**.

<div class="notebook">

<span class="tag">Tessera notebook · entry 2</span>

**Rule of unknown outcome.** *Every remote call in Tessera is assumed able to return "I don't know."* Therefore every mutating endpoint accepts a client-supplied idempotency key, and every consumer deduplicates.

**Consensus can stall.** Datastore primary election and any lock or config service may lose liveness under slow networks even with no node dead (FLP). Tessera's rule: design the stall (queue, shed, degraded reads); forcing a leader is an audited break-glass action.

**Coordination map (draft).** S1 (one effect per key) needs a single arbiter: a unique constraint inside the datastore. Everything else, including order status and IDs, is designed to be coordination-free.

</div>

**Next:** the physics tells us *what* can go wrong. Part II tells us *how much*. [Counting Nines](ch03-counting-nines.md).
