# Counting Nines

<div class="coldopen">

<span class="tag">Cold open · fictional design review</span>

```
Ines:   "Every service in the order path has a 99.9% SLO. So the path is 99.9%?"
You:    "...Yes?"
Ines:   "How many services does an order touch?"
You:    "Twenty."
Ines:   "Open a calculator. Type 0.999, then raise it to the twentieth power."
You:    "0.9802."
Ines:   "That's 174 hours of downtime a year. Not one of your teams missed its SLO."
```

</div>

Availability maths is simple. The surprise is how fast simple things compound. We will go slowly. **Every idea starts with plain numbers, then moves to symbols, then says in words what the symbols mean, and finally says when it stops being true.** If you ever feel lost, drop back to the plain-numbers part of that section.

## Four rules of probability (two minutes)

Everything in this chapter uses four ideas you already know from coins and dice. Here they are, stated once.

<div class="primer">

<span class="tag">The maths you need</span>

**1. A probability is a fraction.** "Available 99.9% of the time" means that out of every 1,000 requests, 999 succeed. As a decimal that is 0.999. We often write it \\( A \\) (for *availability*).

**2. NOT: subtract from 1.** If something works with probability 0.999, it fails with probability \\( 1 - 0.999 = 0.001 \\). We call that failure fraction \\( U \\) (for *unavailability*). So always \\( A + U = 1 \\).

**3. AND: multiply (if the events are independent).** Two events are **independent** when knowing one happened tells you nothing about the other. Flip two fair coins: the chance of two heads is \\( \tfrac12 \times \tfrac12 = \tfrac14 \\). *Why multiply?* Of 100 flips of the first coin, about 50 are heads. Of those 50, about half also have the second coin heads: 25. It is a *fraction of a fraction*, and a fraction of a fraction is a product.

**4. OR: add (if the events cannot both happen).** A die cannot show 2 and 5 at once, so the chance of "2 or 5" is \\( \tfrac16 + \tfrac16 = \tfrac13 \\).

**Two habits.** (a) When a probability is tiny, the product of two tiny probabilities is *far* tinier: \\( 0.001 \times 0.001 = 0.000001 \\). We will lean on that. (b) The sign \\( \approx \\) means "very close to, close enough for engineering".

**Symbols you will meet.** \\( \sum \\) means "add up all of these". \\( \prod \\) means "multiply all of these together". \\( \binom{n}{i} \\) means "the number of ways to choose \\( i \\) things out of \\( n \\)". \\( e \approx 2.718 \\) is a special number we will meet in a moment.

</div>

## How long does a component last?

**The question.** You buy 1,000 identical light bulbs. Some will burn out early, some late. How many are still on after 100 days? After 1,000 days? We want a rule that answers "how many are left on day \\( t \\)?" for *any* \\( t \\).

### Start with plain numbers: one day at a time

There is only one assumption. **Every day, 1 out of every 1,000 bulbs that are still on burns out.** Nothing else matters: a bulb that has lasted a year is exactly as likely to fail tomorrow as a brand-new one. (This is called being *memoryless*.)

Let's just count, one day at a time.

| Day | What happens | Bulbs still on |
|---|---|---|
| 0 | We start with 1,000 | **1,000** |
| 1 | 1 in 1,000 of the 1,000 burns out: we lose 1 | **999** |
| 2 | 1 in 1,000 of the 999 still on: we lose 0.999 | **998.001** |
| 3 | 1 in 1,000 of the 998.001 still on: we lose 0.998 | **997.003** |

(Fractions of a bulb are fine. Read them as averages over many batches of 1,000.)

Notice two things.

1. Each day we lose a hair **less** than the day before, because there are fewer bulbs left to lose. You cannot burn out a bulb that is already dark.
2. Each day we **keep** 999 out of every 1,000. "Keep 999 out of 1,000" is the same as "multiply by 0.999". Do that every day and after \\( d \\) days we have

\\[ 1000 \times 0.999^{d} \\]

where \\( 0.999^{d} \\) just means 0.999 multiplied by itself \\( d \\) times. (This is the "AND means multiply" rule: survive day 1 *and* day 2 *and* … )

Keep going down the table:

| Day | Bulbs still on |
|---|---|
| 10 | 990.0 |
| 100 | 904.8 |
| 500 | 606.4 |
| **693** | **499.9** (half are gone) |
| **1,000** | **367.7** |
| 2,000 | 135.2 |
| 3,000 | 49.7 |

Three things worth sitting with:

- **It is not a straight line.** If we lost one bulb per day, all 1,000 would be gone by day 1,000. But 368 are still on, because the daily loss shrinks as the survivors shrink.
- **Half are gone by day 693**, well before day 1,000.
- **Day 1,000 is the "average lifetime".** If 1 in 1,000 burns out per day, a typical bulb lasts about 1,000 days on average. Yet only 37% are still on at that time. That is not a contradiction: an *average* is not a *midpoint*. A few very lucky bulbs last for ages and pull the average up.

<details>
<summary>Quick check: after 2 days, how many bulbs have burned out in total?</summary>

\\( 1000 - 998.001 = 1.999 \\). Slightly under 2, not exactly 2, because on day 2 the 1-in-1,000 applies to the 999 bulbs still on, not to 1,000.

</details>

<details>
<summary>Quick check: if the rate were 1 in 100 per day (ten times worse), about when would half be gone?</summary>

About ten times sooner: day 69 instead of day 693. Everything just runs ten times faster.

</details>

### Why we slice time finer (and where *e* comes from)

Our "day" was an arbitrary choice. Bulbs do not wait for midnight. What if we counted by the hour instead? The same overall rate means **1 in 24,000 per hour** (24 hours × 1/24,000 = 1/1,000 per day). After 1,000 days, which is 24,000 hours, the fraction left is \\( (1 - 1/24000)^{24000} \\). By the minute: 1 in 1,440,000, for 1,440,000 minutes. Does the answer depend on how we slice?

| Slice size | Number of slices in 1,000 days | Fraction left after 1,000 days |
|---|---|---|
| a day | 1,000 | 0.367695 |
| an hour | 24,000 | 0.367872 |
| a minute | 1,440,000 | 0.367879 |

The answer **barely changes**. However finely you slice, it settles at 0.367879… That settled number has a name: \\( 1/e \\), where \\( e = 2.71828\ldots \\). Like π (which comes from circles), \\( e \\) is a constant that turns up whenever you *shrink by a tiny fraction, a huge number of times*. You do not need to know more than that: **\\( e \\) is simply the answer that the day-by-day counting settles into when you stop caring how finely you slice time.**

### What that gives us: a rule for any day

Measure time in **average lifetimes**: for our bulbs, 1,000 days is one lifetime. After \\( x \\) lifetimes the fraction still on is \\( e^{-x} \\):

| Lifetimes passed \\( x \\) | 0.1 | 0.5 | 0.693 | 1 | 2 | 3 |
|---|---|---|---|---|---|---|
| Fraction still on | 90.5% | 60.7% | 50.0% | 36.8% | 13.5% | 5.0% |
| In days (our bulbs) | 100 | 500 | 693 | 1,000 | 2,000 | 3,000 |

Compare with the day-by-day counts above: day 100 gave 904.8 (90.5%), day 500 gave 606.4 (60.7%), day 1,000 gave 367.7 (36.8%). **Same numbers.** The formula is only a shortcut for the counting.

Look at the pattern in the last row of percentages: 36.8% → 13.5% → 5.0%. **Each extra lifetime multiplies the survivors by about 0.37.**

### Watch it happen

Slide the day. Each dot is a bulb: grey means still on, a red ring means burned out.

<div class="widget" data-widget="bulbs"></div>

Try these: slide to day 693 (about half gone). Slide to day 1,000 (about 37% left). Then set the average lifetime to 500 days and watch everything happen twice as fast.

### Now with symbols

Give the rate a name. Let \\( \lambda \\) (lambda) be the **failure rate**: the fraction of surviving bulbs that fail per unit of time. For our bulbs, \\( \lambda = 1 \\) per 1,000 days \\( = 0.001 \\) per day.

The **average lifetime** is called **MTBF** (mean time between failures). A one-line way to see that \\( \text{MTBF} = 1/\lambda \\): if failures arrive at a rate of \\( \lambda \\) per day, then over \\( T \\) days you see \\( \lambda T \\) of them, so there is one failure every \\( T/(\lambda T) = 1/\lambda \\) days. Here \\( 1/0.001 = 1000 \\) days. ✓.

The rule from the last table, written with symbols, is

\\[ R(t) = e^{-\lambda t} \\]

where \\( R(t) \\) is the fraction still working at time \\( t \\), and \\( \lambda t \\) is just "how many average lifetimes have passed" (the \\( x \\) from the table). Check with our numbers: \\( t = 100 \\) days gives \\( \lambda t = 0.1 \\), and \\( e^{-0.1} = 0.905 \\) ✓.

*Where it comes from:* cut the time \\( t \\) into \\( N \\) slices. In each slice a fraction \\( \lambda t/N \\) fails, so we keep \\( 1 - \lambda t/N \\); after all \\( N \\) slices we keep \\( (1 - \lambda t/N)^N \\), which settles at \\( e^{-\lambda t} \\) as \\( N \\) grows. That is exactly the slicing table above, with \\( \lambda t = 1 \\).

### Reading the result

A part with an MTBF of 2 years has \\( \lambda = 0.5 \\) per year. The chance it survives **one** year is \\( e^{-0.5} \approx 61\% \\). The chance it survives a full **MTBF** (2 years, where \\( \lambda t = 1 \\)) is \\( e^{-1} \approx 37\% \\). Slide the widget to see it.

<div class="widget" data-widget="survival"></div>

<details>
<summary>For the calculus-minded: the same result by differential equation</summary>

Let \\( R(t) \\) be the survival probability. Surviving to \\( t+dt \\) means surviving to \\( t \\) *and* surviving one more tiny step: \\( R(t+dt) = R(t)(1-\lambda\\,dt) \\). Rearranging gives \\( \dfrac{dR}{dt} = -\lambda R \\): "the rate of decline is proportional to what is left", whose solution with \\( R(0)=1 \\) is \\( R(t) = e^{-\lambda t} \\). The mean lifetime is the area under the survival curve, \\( \int_0^{\infty} e^{-\lambda t}\\,dt = 1/\lambda \\).

</details>

### Where this stops being true

Real parts are not memoryless. New software releases fail early (*infant mortality*); old processes wear out (leaks, fragmentation, expiring certificates). Treat a constant \\( \lambda \\) as a first approximation, and expect *change events* (deploys, config flips) to dominate it.

## From failures to availability

**The question.** Over a long time, what fraction of the time is the component *working*?

### Start with plain numbers: one year of a part's life

A part breaks about 12 times a year (roughly once a month), and each break takes 30 minutes to fix. Let's count the whole year.

| Step | What we work out | Number |
|---|---|---|
| 1 | Hours in a year | 8,766 |
| 2 | Hours spent broken: 12 breaks × 0.5 hours | 6 |
| 3 | Hours spent working: 8,766 − 6 | 8,760 |
| 4 | Fraction of the year working: 8,760 ÷ 8,766 | **0.99932** |

So the part is available **99.93%** of the time. (Six broken hours out of 8,766 is 0.068%.) That is all "availability" means: *time working ÷ total time*.

Now give the two ingredients names, because we will reuse them:

- On average it works for \\( 8760 \div 12 = 730 \\) hours between breaks. That is the **MTBF** (mean time between failures).
- On average each fix takes 0.5 hours. That is the **MTTR** (mean time to repair).

A year is just 12 identical cycles of "work, then break, then fix". So we can do the sum on **one cycle** instead:

```text
 ── works 730 h ──────────────┐ broken 0.5 h ┌── works 730 h ──────────┐ broken 0.5 h ┌──
```

One cycle is \\( 730 + 0.5 = 730.5 \\) hours, of which 730 are working: \\( 730/730.5 = 0.99932 \\). Same answer as the year view, as it must be.

<details>
<summary>Quick check: if each fix took 3 hours instead of 0.5, what is the availability?</summary>

One cycle is \\( 730 + 3 = 733 \\) hours, so \\( 730/733 = 0.99591 \\), about 99.6%. A slower repair cost you most of a "nine".

</details>

### Now with symbols

In symbols, with MTBF the average time working between breaks and MTTR the average repair time:

\\[ A = \frac{\text{MTBF}}{\text{MTBF} + \text{MTTR}} \\]

*In words:* availability is "time up" divided by "total time". There are no tricks in it.

Now a useful rewrite. Divide the top and bottom of that fraction by MTBF:

\\[ A = \frac{1}{1 + \text{MTTR}/\text{MTBF}} \\]

and since \\( 1/\text{MTBF} = \lambda \\), the ratio \\( \text{MTTR}/\text{MTBF} \\) equals \\( \lambda \times \text{MTTR} \\). Call that small number \\( x \\):

\\[ A = \frac{1}{1+x}, \qquad x = \lambda \times \text{MTTR} \\]

**The shortcut.** When \\( x \\) is small, \\( \dfrac{1}{1+x} \\) is very close to \\( 1 - x \\). You do not need to take that on trust:

| \\( x \\) | \\( 1/(1+x) \\) | \\( 1 - x \\) | Difference |
|---|---|---|---|
| 0.1 | 0.90909 | 0.9 | 0.9% |
| 0.01 | 0.990099 | 0.99 | 0.01% |
| 0.001 | 0.999001 | 0.999 | 0.0001% |

So, for the small numbers we deal with in real systems,

\\[ U = 1 - A \approx \lambda \times \text{MTTR} \\]

### Reading the result

\\( \lambda \\) is *failures per year* and MTTR is *time per failure*. Multiply them and you get *time down per year*. Twelve incidents a year at thirty minutes each is 360 minutes, or 6 hours, which is \\( 6/8766 = 0.068\% \\) of the year's hours. That matches the timeline above.

The formula also tells you there are **two levers**: fail less often (\\( \lambda \\)) or recover faster (MTTR). Halving either has exactly the same effect. Recovery is usually the cheaper lever: faster detection, automated rollback, smaller blast radius.

### Where this stops being true

It treats failure as an on/off event followed by a repair. Slow degradation, partial failure and brownouts do not fit. And an average hides the *shape* of downtime (see the warning at the end of the chapter).

## What a "nine" is

People quote availability as "number of nines": 99.9% is "three nines". Each extra nine means **ten times less downtime**. To turn availability into downtime, use minutes in a year: \\( 365.25 \times 24 \times 60 = 525{,}960 \\). Downtime per year is \\( U \times 525{,}960 \\) minutes.

| Availability | Down per year | Down per 30 days | Down per day |
|---|---|---|---|
| 90% (one nine) | 36.5 days | 3 days | 2.4 hours |
| 99% (two nines) | 3.65 days | 7.2 hours | 14.4 min |
| 99.9% (three nines) | 8.8 hours | 43.2 min | 1.4 min |
| 99.99% (four nines) | 52.6 min | 4.3 min | 8.6 s |
| 99.999% (five nines) | 5.3 min | 26 s | 0.9 s |

Play with the slider and anchor on three landmarks: three nines is about **9 hours a year**, four nines about **an hour**, five nines about **five minutes**.

<div class="widget" data-widget="downtime"></div>

The "incident" line in the widget is the real conversation behind an SLO: three nines allows about seventeen 30-minute incidents a year; four nines fewer than two. *How many bad half-hours can we afford?*

## Hops in series: when everything must work

**The question.** A request must pass through several services one after another. If any one fails, the request fails. What is the chance it succeeds?

### Start with plain numbers: follow the requests down the chain

*Warm-up with big, easy numbers.* Each hop works 90% of the time. Send 100 requests through three hops and see how many are still alive after each:

| After | Requests still alive | How we got it |
|---|---|---|
| Start | 100 | |
| Hop 1 | 90 | 90% of 100 |
| Hop 2 | 81 | 90% of 90 |
| Hop 3 | 72.9 | 90% of 81 |

Every hop keeps 90% of what reaches it, so we multiply by 0.9 each time: \\( 0.9 \times 0.9 \times 0.9 = 0.729 \\). That is the AND rule again: a request needs hop 1 *and* hop 2 *and* hop 3.

*Now real numbers.* Each hop works 99.9% of the time (three nines). Send **10,000** requests and see how many survive:

| After | Requests still alive | Lost at this hop |
|---|---|---|
| Start | 10,000 | |
| Hop 1 | 9,990 | 10.0 |
| Hop 2 | 9,980.0 | 10.0 |
| Hop 3 | 9,970.0 | 10.0 |
| Hop 5 | 9,950.1 | 10.0 |
| Hop 10 | 9,900.4 | 10.0 |
| Hop 20 | 9,801.9 | 9.9 |

Look at the right-hand column. **Every hop takes almost exactly the same bite: about 10 requests, which is 0.1% of 10,000.** (Slightly less each time, because slightly fewer requests remain.) After 20 hops, 20 bites of about 10 means about 198 requests lost out of 10,000, which is 1.98%.

So when each failure chance is small, **20 hops of 0.1% behave like one hop of about 20 × 0.1% = 2%.** That single sentence is the heart of this section. The widget below lets you watch it with real random requests.

<details>
<summary>Quick check: 5 hops, each 99% available. Roughly what survives?</summary>

Five bites of about 1% each: about 5% lost, so about 95% survive. Exactly: \\( 0.99^5 = 0.951 \\).

</details>

### Watch it happen

<div class="widget" data-widget="dots"></div>

Each dot is a request. Raise the hops and the red dots multiply roughly in proportion; raise the nines and they thin out tenfold per nine. The little red columns underneath show *which hop* killed each failed request. Notice they are all about the same height: each hop takes its small bite.

### Now with symbols

If hop \\( i \\) has availability \\( A_i \\), the request needs hop 1 **and** hop 2 **and** … hop \\( n \\) to work. Using rule 3 repeatedly:

\\[ A_{\text{chain}} = A_1 \times A_2 \times \cdots \times A_n = \prod_{i=1}^{n} A_i \\]

(\\( \prod \\) just means "multiply all the \\( A_i \\) together".) Check: \\( n=20 \\), each 0.999 gives \\( 0.999^{20} = 0.9802 \\), the 98% we found by counting bites.

### Why the bites "add"

Write each hop as \\( A_i = 1 - U_i \\). For two hops:

\\[ (1-U_1)(1-U_2) = 1 - U_1 - U_2 + U_1 U_2 \\]

Picture a unit square. The right-hand column is hop 1 failing (it is \\( U_1 \\) wide). The bottom row is hop 2 failing (it is \\( U_2 \\) tall). The small corner where they cross is *both* failing, with area \\( U_1 \\times U_2 \\):

```text
 ┌──────────────────────┬────────┐
 │                      │        │
 │        works         │ hop 1  │
 │  (1 - U1) x (1 - U2) │ fails  │
 │                      │  (U1)  │
 ├──────────────────────┼────────┤
 │  hop 2 fails (U2)    │  both  │
 └──────────────────────┴────────┘
```

Adding \\( U_1 + U_2 \\) measures the right column plus the bottom row, which counts the corner **twice**. So the exact downtime is \\( U_1 + U_2 - U_1U_2 \\), and "just add the downtimes" over-counts by the tiny corner. How tiny?

| Each hop's \\( U \\) | Exact \\( U_{\text{chain}} \\) (2 hops) | Simply add: \\( U_1+U_2 \\) |
|---|---|---|
| 10% | 19% | 20% |
| 1% | 1.99% | 2% |
| 0.1% | 0.1999% | 0.2% |

The smaller the \\( U \\), the better the shortcut. With \\( n \\) hops the same thing happens (more corners, all tiny), so:

\\[ U_{\text{chain}} \approx U_1 + U_2 + \cdots + U_n = \sum_{i=1}^{n} U_i \\]

(\\( \sum \\) means "add all of these up".) **In series, downtimes add.** Twenty hops at \\( U = 0.001 \\): about \\( 20 \times 0.001 = 0.02 \\), i.e. 98%, or about 174 hours of downtime a year.

### Where this stops being true

- **Failures are not always independent.** If hop 1 failing makes hop 2 likelier to fail, the product is off (Chapter 4).
- **A hop that can be retried or skipped** is not a pure "must work" link.
- **Different requests take different paths.** Compute availability *per user journey*, not once for the whole system.

### What to do with it

The design consequences are bigger than any hardening you do per service:

1. **Cut hops.** Every hard synchronous dependency you remove is a free multiplier.
2. **Demote dependencies.** Turn *hard* into *soft* (can degrade) or *async* (can wait).
3. **Your SLO ceiling is the product of your hard dependencies' availability.** A vendor's 99.9% means you cannot honestly promise 99.95%.

## Redundancy: when any one copy will do

**The question.** You run \\( m \\) copies of something and the service works if *at least one* copy works. What is the chance the service is down?

### Start with plain numbers: 10,000 random moments

Two servers, each down 1% of the time (that is 3.65 days a year). The service works if *at least one* server is up, so it is down only when **both** are down at the same moment.

Pick 10,000 random moments in the year and sort them into four boxes:

| | Server B up (99%) | Server B down (1%) |
|---|---|---|
| **Server A up (99%)** | 9,801 | 99 |
| **Server A down (1%)** | 99 | **1** |

How we filled it in:

- A is down at 1% of 10,000 = **100** of the moments (the bottom row: 99 + 1).
- Of those 100 moments, B is *also* down 1% of the time: **1** moment. (This assumes B's troubles are independent of A's.) The other 99 are "A down, B up".
- Likewise 99 moments have A up and B down. The remaining \\( 10000 - 99 - 99 - 1 = 9801 \\) have both up.

The service is down only in the bottom-right box: **1 moment in 10,000**, which is 0.01% (about 53 minutes a year). Compare one server alone: 100 in 10,000, or 1% (3.65 days).

A third server: one more "1% of that": 1 moment in 1,000,000, about **32 seconds** a year.

<details>
<summary>Quick check: three servers, each only 90% available. How often is the service down?</summary>

All three must be down together: \\( 0.1 \times 0.1 \times 0.1 = 0.001 \\), or 0.1%. So three mediocre 90% servers make a 99.9% service, *if their failures are independent*.

</details>

### Now with symbols

The service is down only if **all** \\( m \\) copies are down. By rule 3 (multiply), with \\( U_i \\) the unavailability of copy \\( i \\):

\\[ U_{\text{sys}} = U_1 \times U_2 \times \cdots \times U_m \qquad\text{and}\qquad A_{\text{sys}} = 1 - U_{\text{sys}} \\]

**In parallel, unavailabilities multiply.** Each extra copy multiplies the downtime by *another* \\( U \\): a hundredfold gain here, for one extra box.

### Where this stops being true

The phrase doing all the work is **"independent"**. If one failure makes another likelier (same release, same dependency, same rack), the product is wrong, and wrong in the optimistic direction. Chapter 4 is entirely about that. Also, switchover is not instant: the time taken to detect and switch counts as downtime for requests in flight.

## "At least k out of n"

**The question.** Often you need *at least* \\( k \\) of \\( n \\) units: a majority of three clusters to agree, or enough servers to carry peak load. What is the chance enough units are up?

### Start with plain numbers: coins first

Warm up with something familiar. Flip **three fair coins**. What is the chance of **at least 2 heads**? List all \\( 2^3 = 8 \\) outcomes. With fair coins each one is equally likely, \\( 1/8 \\):

| Outcome | HHH | HHT | HTH | THH | HTT | THT | TTH | TTT |
|---|---|---|---|---|---|---|---|---|
| Heads | 3 | 2 | 2 | 2 | 1 | 1 | 1 | 0 |
| At least 2? | yes | yes | yes | yes | no | no | no | no |

Four of eight patterns qualify: \\( 4/8 = 50\% \\).

Now replace "heads" with "cluster is up". The system works if at least 2 of 3 clusters are up. **The only change is that the coins are no longer fair:** each cluster is up 99.9% of the time and down 0.1%. The eight patterns are the same, but they are no longer equally likely, so we weight each one by multiplying (rule 3). Write U for up and D for down:

| Pattern | Clusters up | Probability of this pattern | Works? |
|---|---|---|---|
| UUU | 3 | \\( 0.999 \times 0.999 \times 0.999 = 0.997003 \\) | yes |
| UUD | 2 | \\( 0.999 \times 0.999 \times 0.001 = 0.000998 \\) | yes |
| UDU | 2 | \\( 0.000998 \\) | yes |
| DUU | 2 | \\( 0.000998 \\) | yes |
| UDD | 1 | \\( 0.999 \times 0.001 \times 0.001 \approx 0.000001 \\) | no |
| DUD | 1 | \\( \approx 0.000001 \\) | no |
| DDU | 1 | \\( \approx 0.000001 \\) | no |
| DDD | 0 | \\( 0.001^3 = 0.000000001 \\) | no |

Only one pattern can be the real state at any moment (they are mutually exclusive), so by rule 4 we **add** the probabilities of the patterns that work:

\\[ 0.997003 + 0.000998 + 0.000998 + 0.000998 = 0.999997 \\]

That is **99.9997%**, about 1.6 minutes of downtime a year, *if the clusters fail independently*.

<details>
<summary>Quick check: which patterns would count if we needed all 3 clusters (3-of-3)?</summary>

Only UUU, with probability 0.997003, or about 99.7%. Needing *all* is far worse than needing *most*: demanding more of the units lowers availability.

</details>

### Now with symbols

Notice the pattern: "exactly 2 up" appeared **3 times** (UUD, UDU, DUU), each with the same probability. In general, the number of ways to choose *which* \\( i \\) of \\( n \\) units are up is written \\( \binom{n}{i} \\) ("n choose i"). Here \\( \binom{3}{2} = 3 \\). (The formula is \\( \binom{n}{i} = \dfrac{n!}{i!\\,(n-i)!} \\), where \\( n! = n \times (n-1) \times \cdots \times 1 \\), but you rarely need it: list the patterns, as above.)

Each such pattern has probability \\( a^{i}(1-a)^{n-i} \\) (i units up, the rest down). Add over every acceptable count \\( i \\) from \\( k \\) up to \\( n \\):

\\[ A = \sum_{i=k}^{n} \binom{n}{i}\\, a^{i} (1-a)^{n-i} \\]

For our case that is \\( a^3 + 3a^2(1-a) \\), exactly the sum we computed.

### A shortcut for small \\( U \\): count the ways to lose

Rather than add up the good cases, look at the **bad** ones. With \\( U = 1-a \\) small, the system fails mostly through the *cheapest* way to fail: just enough units down. To lose, **2** of 3 must be down. How many ways? \\( \binom{3}{2} = 3 \\) (UDD, DUD, DDU), each with probability about \\( U^2 \\):

\\[ U_{\text{sys}} \approx 3\\,U^2 = 3 \times 10^{-6} \\]

matching the exact answer. In general, if you can lose \\( f = n - k \\) units, the system fails when \\( f + 1 \\) are down:

\\[ U_{\text{sys}} \approx \binom{n}{f+1}\\, U^{f+1} \\]

*In words:* every additional failure you can tolerate multiplies unavailability by another \\( U \\) (a factor of a thousand for three-nines parts), at the price of more ways to lose.

### Where this stops being true

Independence again, and the units must be *identical* (same capacity, same failure behaviour) for the counting to work.

## When "up or down" is the wrong question

Not every failure is all-or-nothing. If the carrier-rate API is down, Tessera falls back to cached rates that deliver a fraction \\( q = 0.8 \\) of full value. How much value do we deliver *on average*?

### Start with plain numbers: 1,000 orders

Take 1,000 orders. The carrier-rate API is up 99% of the time, so for **990** of them we get a live price and deliver full value (1.0 each). For the other **10** the API is down, we use a cached price, and each is worth only 0.8 of full value.

- Value from the 990: \\( 990 \times 1.0 = 990 \\)
- Value from the 10: \\( 10 \times 0.8 = 8 \\)
- Total \\( 998 \\) out of a possible 1,000. Average per order: **0.998**.

So we deliver 99.8% of full value on average, even though the dependency is down 1% of the time.

### Now with symbols

\\[ E[\text{value}] = A_D \times 1 + (1 - A_D) \times q \\]

with \\( A_D \\) the dependency's availability. With more states, add one term per state: \\( E = \sum_s P(s)\\,V(s) \\) (probability of each state times its value).

### Reading the result

It forces a conversation engineers usually skip: *what is a degraded order actually worth?* That is a product decision, and the arithmetic makes it unavoidable.

> [!WARNING]
> **Common misreading: "99.9% means one request in a thousand fails."** Availability averages over the *shape* of failure. 8.8 hours a year could be one catastrophic outage or 526 one-minute blips; customers, contracts and on-call experience them very differently. Pair an availability target with limits on the **longest single outage** and on **errors within any short window**.

<div class="rules">

<span class="tag">Rules of thumb</span>

1. **Series: add the downtimes. Parallel: multiply the unavailabilities.**
2. One hard dependency at three nines costs about **9 hours a year**; twenty cost about 175.
3. Three nines ≈ seventeen 30-minute incidents a year. Four nines ≈ fewer than two.
4. **Halving MTTR is as good as halving the failure rate.**
5. Your availability can never exceed that of your weakest *hard* dependency.
6. **An MTBF is an average, not a guarantee:** only 37% of parts last a full MTBF.

</div>

## Checkpoint

<details>
<summary>1. A path has 8 hard dependencies at 99.95% each. Roughly what availability can you promise?</summary>

\\( 0.9995^8 \approx 0.9960 \\): about 99.6%. You cannot promise 99.95% on this path no matter how well your own service is run.

</details>

<details>
<summary>2. Your service fails 4 times a year and takes 45 minutes to recover. What is A? What if MTTR is cut to 15 minutes?</summary>

At 45 min: \\( U \approx 180/525960 \approx 0.034\% \\), \\( A \approx 99.966\% \\). At 15 min: \\( U \approx 60/525960 \approx 0.011\% \\), \\( A \approx 99.989\% \\). A threefold gain from recovery speed alone.

</details>

<details>
<summary>3. Why is converting a hard dependency to async often better than making it more reliable?</summary>

An async dependency leaves the synchronous path entirely, so it contributes no term to the series product. Reliability work reduces a term from, say, 0.999 to 0.9999; removal sets it to 1, and lets the dependency's downtime be absorbed by a queue.

</details>

## Takeaways

- Unavailability ≈ \\( \lambda \cdot \text{MTTR} \\): **recovery speed is a first-class lever.**
- **Series multiplies**, so hop count and hard-dependency count dominate.
- Parallel and k-of-n help, but only as far as failures are independent (next chapter).
- Model **utility per state**, not only up/down.

<div class="notebook">

<span class="tag">Tessera notebook · entry 3</span>

**Critical path (synchronous, hard):** global traffic manager → ingress/mesh → ingestion service → datastore write.
**Async or soft:** event log, billing, dispatch, notifications, carrier-rate pricing (falls back to cached tariff).

Draft budget with *illustrative* component numbers: 0.9999 × 0.9999 × 0.9999 × 0.99995 ≈ **0.99965**. That clears L2's 99.95% target, but only by a thin margin (about 79 minutes a year). Chapter 4 shows how fragile that margin is.

</div>

**Next:** the formulas above assumed independence. Reality does not. [When Failures Hold Hands](ch04-when-failures-hold-hands.md).
