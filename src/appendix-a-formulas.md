# A. Formula Sheet

Everything quantitative in the book, in one place. Chapter references in brackets. **Every formula here is derived step by step, with its assumptions, in the chapter cited. If one looks arbitrary, start there.**

## Availability and composition (Ch. 3–4)

| Quantity | Formula |
|---|---|
| Reliability | \\( R(t) = e^{-\lambda t} \\) |
| MTBF | \\( 1/\lambda \\) |
| Availability | \\( A = \dfrac{\text{MTBF}}{\text{MTBF}+\text{MTTR}} \approx 1 - \lambda\\,\text{MTTR} \\) |
| Series | \\( A = \prod_i A_i \\) |
| Parallel (independent) | \\( A = 1 - \prod_i (1 - A_i) \\) |
| k-of-n | \\( A = \sum_{i=k}^{n} \binom{n}{i} a^i (1-a)^{n-i} \\) |
| Utility with fallback | \\( E[U] = A_D + (1-A_D)\\,q \\) |
| Common cause (β) | \\( U_{\text{sys}} \approx \beta U + ((1-\beta)U)^m \\) |
| Blast radius (N cells) | \\( 1/N \\) |
| Shuffle shards | \\( \binom{N}{k} \\), overlap probability \\( 1/\binom{N}{k} \\) |

## Latency, queues, capacity (Ch. 5)

| Quantity | Formula |
|---|---|
| Fan-out tail | \\( P = 1-(1-p)^n \\); leaf budget \\( p = 1-(1-P)^{1/n} \\) |
| Little's Law | \\( L = \lambda W \\) |
| M/M/1 | \\( \rho = \lambda/\mu \\), \\( W = \dfrac{1/\mu}{1-\rho} \\) |
| N+k capacity | \\( (n-f)\\,\mu\\,\rho_{\max} \ge \lambda_{\text{peak}} \\) |
| Steady ρ allowed after losing f of n | \\( \rho_{\max}\\,(n-f)/n \\) |
| Backlog | \\( B = \lambda T \\) |
| Drain time | \\( T_{\text{drain}} = T\\,\rho/(1-\rho) \\) |
| Deadline budget | \\( D \ge \sum_i (a_i t_i + b_i) \\) |

## Feedback (Ch. 6)

| Quantity | Formula |
|---|---|
| Attempts per request, one layer | \\( \sum_{i=0}^{r} f^i \\) |
| Worst-case amplification, depth d | \\( (r+1)^d \\) |
| Retry budget cap | \\( 1 + b \\) |
| Effective-load fixed point | \\( \lambda_{\text{eff}} = \lambda\\,(1 + r f(\lambda_{\text{eff}})) \\) |
| Stability | loop gain \\( G < 1 \\) |

## Detection, quorums, time (Ch. 7)

| Quantity | Formula |
|---|---|
| False-positive per check | \\( 1 - F(T) \\) |
| φ-accrual | \\( \varphi = -\log_{10} P(\text{later than } t) \\) |
| Crash-fault quorum | \\( n \ge 2f+1 \\) |
| Byzantine quorum | \\( n \ge 3f+1 \\) |
| Read/write overlap | \\( R + W > N \\) |
| Lease safe-use window | \\( t_{\text{acq}} + L - \varepsilon - t_{\text{pause}}^{\max} \\) |

## Idempotency (Ch. 8)

| Quantity | Formula |
|---|---|
| Idempotent | \\( f(f(x)) = f(x) \\) |
| Expected duplicates/day | messages/day × duplicate rate |
| Dedup window | \\( \ge \\) retry horizon + retention + lag + replay horizon |

## Budgets and risk (Ch. 9)

| Quantity | Formula |
|---|---|
| Error budget | \\( (1-\text{SLO}) \times \text{window} \\) |
| Burn rate | \\( \text{error rate}/(1-\text{SLO}) \\) |
| Share of budget spent in time t at burn b | \\( b\\,t/\text{window} \\) |
| Risk | \\( \sum_i P_i \times \text{impact}_i \\) |
| RPN | \\( S \times O \times D \\) |
| MTTR | \\( t_{\text{detect}} + t_{\text{diagnose}} + t_{\text{decide}} + t_{\text{act}} + t_{\text{verify}} \\) |

## Handy numbers

| Availability | Downtime per year | Per 30 days |
|---|---|---|
| 99% | 3.65 days | 7.2 hours |
| 99.9% | 8.77 hours | 43.2 minutes |
| 99.95% | 4.38 hours | 21.6 minutes |
| 99.99% | 52.6 minutes | 4.32 minutes |
| 99.999% | 5.26 minutes | 26 seconds |

## Back-of-the-envelope toolkit

Ten estimates you can do in your head. Each links to the chapter that explains why it works.

| # | Rule | Example | Chapter |
|---|---|---|---|
| 1 | Minutes per year ≈ **525,960** (about half a million). Downtime = (1 − A) × that. | 99.9% → 526 min | 3 |
| 2 | **Series: add the downtimes.** | 20 hops × 0.1% ≈ 2% | 3 |
| 3 | **Parallel: multiply** (only if independent). | 1% × 1% = 0.01% | 3 |
| 4 | Redundancy floor is \\( \beta U \\); past 2 replicas you are fighting β. | β = 0.1 → floor 10% of one replica | 4 |
| 5 | Fan-out: \\( P \approx 1 - e^{-np} \\); trouble when \\( np \gtrsim 1 \\). | 100 calls at 1% → 63% | 5 |
| 6 | \\( L = \lambda W \\). | 500/s × 40 ms = 20 | 5 |
| 7 | Latency ÷ service time = 1 ÷ spare capacity. | 10% spare → 10× | 5 |
| 8 | Drain time = outage × load ÷ spare. | 60 s at ρ = 0.9 → 9 min | 5 |
| 9 | Retries multiply: \\( (r+1)^d \\); a collapse needs \\( r\rho > 1 \\) (toy model). | 3 attempts, 3 layers → 27× | 6 |
| 10 | Hours to exhaust budget = window hours ÷ burn. | 720/14.4 = 50 h | 9 |

And one for quorums: a majority of \\( n \\) is \\( \lfloor n/2 \rfloor + 1 \\); any two majorities overlap.
