/* Failure by Design: interactive widgets (vanilla JS, no dependencies).
   Usage in a chapter:  <div class="widget" data-widget="nines"></div>  */
(function () {
  'use strict';

  /* ---------- Pure model code (also unit-tested with node) ---------- */
  const Core = {
    seriesA: (n, a) => Math.pow(a, n),
    ccfU: (U, m, beta) => beta * U + Math.pow((1 - beta) * U, m),
    fanout: (p, n) => 1 - Math.pow(1 - p, n),
    leafP: (P, n) => 1 - Math.pow(1 - P, 1 / n),
    wMult: (rho) => 1 / (1 - rho),
    drain: (T, rho) => (T * rho) / (1 - rho),
    retryMult: (f, r, d) => {
      let s = 0;
      for (let i = 0; i <= r; i++) s += Math.pow(f, i);
      return Math.pow(s, d);
    },
    /* Fluid model of a service with a FIFO queue, client timeouts and retries.
       Work that finishes after the client gave up is wasted: that is what makes
       overload self-sustaining. Retries are capped at r x fresh load (max attempts r+1). */
    simulate(o) {
      const C = o.C || 100, base = o.base || 70, spikeH = o.spikeH || 80;
      const spikeStart = o.spikeStart || 15, spikeLen = o.spikeLen || 8;
      const T = o.T || 3, r = o.r || 0, ticks = o.ticks || 100;
      let q = 0, retries = 0;
      const out = [];
      for (let t = 0; t < ticks; t++) {
        const spike = t >= spikeStart && t < spikeStart + spikeLen ? spikeH : 0;
        const fresh = base + spike;
        const arrivals = fresh + retries;
        const cap = o.shed ? C * T * 0.5 : C * 10;
        const admitted = Math.min(arrivals, Math.max(0, cap - q));
        const rejected = arrivals - admitted;
        q += admitted;
        const p = Math.min(q, C);
        q -= p;
        const L = q / C;
        const u = Math.max(0, Math.min(1, 1 - Math.max(0, L - T) / T));
        const g = p * u;
        const failures = rejected + (p - g);
        let rt = Math.min(failures, r * fresh);
        if (o.budget) rt = Math.min(rt, 0.1 * fresh);
        retries = rt;
        out.push({ t, offered: arrivals, goodput: g, q, L, spike });
      }
      return out;
    }
  };

  /* ---- intuition helpers ---- */
  function erf(x) {
    const sgn = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return sgn * y;
  }
  /* P(heartbeat still silent after t | healthy), assuming normal gaps; phi = -log10 of that */
  Core.phi = (t, mu, sd) => {
    const p = 0.5 * (1 - erf((t - mu) / (sd * Math.SQRT2)));
    return { p, phi: p > 0 ? -Math.log10(p) : Infinity };
  };
  /* Load seen next round, given load x now: failures grow with x, retries add to fresh load. */
  Core.cobwebG = (x, lam, r, C) => lam * (1 + r * Math.max(0, Math.min(1, (x - C) / C)));
  Core.cobwebFixed = (lam, r, C) => {
    const hi = lam * (1 + r) * 1.2 + 10, out = [];
    let prev = Core.cobwebG(0, lam, r, C) - 0;
    for (let x = 0.05; x <= hi; x += 0.05) {
      const cur = Core.cobwebG(x, lam, r, C) - x;
      if (prev === 0 || prev * cur < 0) {
        const slope = (Core.cobwebG(x + 0.5, lam, r, C) - Core.cobwebG(x - 0.5, lam, r, C)) / 1.0;
        const last = out[out.length - 1];
        if (!last || Math.abs(last.x - x) > 1) out.push({ x: +x.toFixed(1), stable: Math.abs(slope) < 1 });
      }
      prev = cur;
    }
    return out;
  };

  if (typeof module !== 'undefined') module.exports = Core;
  if (typeof document === 'undefined') return;
  window.FBD = Core;

  /* ---------- Tiny DOM helpers ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    kids.forEach((c) => e.append(c));
    return e;
  }
  function slider(parent, label, min, max, step, value, fmt, cb) {
    const input = h('input', { type: 'range', min, max, step, value });
    const val = h('span', { class: 'val' });
    const row = h('div', { class: 'row' }, h('label', {}, label), input, val);
    const upd = () => { val.textContent = fmt(+input.value); cb(); };
    input.addEventListener('input', upd);
    parent.append(row);
    val.textContent = fmt(+value);
    return { get: () => +input.value };
  }
  function title(el, t) { el.append(h('h4', {}, t)); }
  function outBox(el) { const o = h('div', { class: 'out' }); el.append(o); return o; }
  const pct = (x, d = 4) => (x * 100).toFixed(d) + '%';
  const nines = (u) => (u <= 0 ? '∞' : (-Math.log10(u)).toFixed(2));
  function dur(mins) {
    if (mins < 1) return (mins * 60).toFixed(1) + ' s';
    if (mins < 120) return mins.toFixed(1) + ' min';
    if (mins < 60 * 48) return (mins / 60).toFixed(1) + ' h';
    return (mins / 1440).toFixed(1) + ' days';
  }
  const YEAR_MIN = 525960;
  const aFromNines = (x) => 1 - Math.pow(10, -x);
  function ink() { return getComputedStyle(document.body).color; }
  function canvas(el, w, hgt) {
    const c = h('canvas', { width: w, height: hgt });
    el.append(c);
    return c;
  }

  const W = {};

  /* ---------- Chapter 3 ---------- */
  W.series = (el) => {
    title(el, 'Try it: the chain of nines');
    const out = outBox(el);
    let n, x;
    const go = () => {
      const a = aFromNines(x.get()), A = Core.seriesA(n.get(), a), U = 1 - A;
      out.innerHTML = `Each service: <b>${pct(a, 3)}</b>. A request through <b>${n.get()}</b> hard dependencies succeeds with <b>${pct(A, 3)}</b> (≈ ${nines(U)} nines). Expected downtime: <b>${dur(U * YEAR_MIN)}</b> per year.`;
    };
    n = slider(el, 'Hard dependencies in series', 1, 60, 1, 20, (v) => v, go);
    x = slider(el, 'Per-service nines', 1.5, 5, 0.1, 3, (v) => v.toFixed(1), go);
    el.insertBefore(out, null); go();
  };

  /* ---------- Chapter 4 ---------- */
  W.ccf = (el) => {
    title(el, 'Try it: redundancy vs. common-cause failure');
    const out = outBox(el);
    let x, m, b;
    const go = () => {
      const U = 1 - aFromNines(x.get());
      const ind = Math.pow(U, m.get()), real = Core.ccfU(U, m.get(), b.get());
      out.innerHTML = `If replicas failed independently: <b>${pct(1 - ind, 5)}</b> (${dur(ind * YEAR_MIN)}/yr down).<br>With β = ${b.get().toFixed(2)} common-cause: <b>${pct(1 - real, 5)}</b> (${dur(real * YEAR_MIN)}/yr down).<br>You paid for ${m.get()} replicas and got <b>${(Math.log10(real) / Math.log10(U)).toFixed(2)}</b> replicas' worth of nines.`;
    };
    x = slider(el, 'Per-replica nines', 1.5, 4, 0.1, 2, (v) => v.toFixed(1), go);
    m = slider(el, 'Replicas', 1, 6, 1, 3, (v) => v, go);
    b = slider(el, 'β (shared-fate fraction)', 0, 0.5, 0.01, 0.1, (v) => v.toFixed(2), go);
    go();
  };

  W.shuffle = (el) => {
    title(el, 'Try it: shuffle sharding');
    const out = outBox(el);
    let N, k;
    const comb = (n, r) => { let c = 1; for (let i = 1; i <= r; i++) c = (c * (n - r + i)) / i; return c; };
    const go = () => {
      const c = comb(N.get(), Math.min(k.get(), N.get()));
      out.innerHTML = `${N.get()} workers, each client gets ${k.get()}: <b>${c.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b> distinct shards. A poison client shares your <i>entire</i> shard with probability <b>${(1 / c).toExponential(2)}</b>.`;
    };
    N = slider(el, 'Workers (N)', 6, 200, 1, 100, (v) => v, go);
    k = slider(el, 'Shard size (k)', 1, 10, 1, 5, (v) => v, go);
    go();
  };

  /* ---------- Chapter 5 ---------- */
  W.fanout = (el) => {
    title(el, 'Try it: the tail at scale');
    const out = outBox(el);
    let p, n, t;
    const go = () => {
      const P = Core.fanout(p.get() / 100, n.get());
      const leaf = Core.leafP(t.get() / 100, n.get());
      out.innerHTML = `One call is slow ${p.get().toFixed(2)}% of the time. A request fanning out to <b>${n.get()}</b> calls is slow <b>${(P * 100).toFixed(1)}%</b> of the time.<br>To keep the <i>whole request</i> slow only ${t.get().toFixed(1)}% of the time, each leaf may be slow at most <b>${(leaf * 100).toFixed(4)}%</b>.`;
    };
    p = slider(el, 'P(one call slow)', 0.01, 5, 0.01, 1, (v) => v.toFixed(2) + '%', go);
    n = slider(el, 'Fan-out (n)', 1, 500, 1, 100, (v) => v, go);
    t = slider(el, 'Target for whole request', 0.1, 10, 0.1, 1, (v) => v.toFixed(1) + '%', go);
    go();
  };

  W.queue = (el) => {
    title(el, 'Try it: the knee of the curve');
    const out = outBox(el);
    const cv = canvas(el, 640, 240);
    let rho, n, f, rm;
    const draw = () => {
      const g = cv.getContext('2d'), w = cv.width, hh = cv.height, col = ink();
      g.clearRect(0, 0, w, hh);
      g.strokeStyle = col; g.fillStyle = col; g.globalAlpha = 0.5; g.lineWidth = 1;
      g.beginPath(); g.moveTo(40, 10); g.lineTo(40, hh - 30); g.lineTo(w - 10, hh - 30); g.stroke();
      g.globalAlpha = 1; g.font = '12px sans-serif';
      g.fillText('latency ÷ service time', 46, 18); g.fillText('utilisation ρ →', w - 110, hh - 12);
      const X = (r) => 40 + r * (w - 60), Y = (m) => hh - 30 - Math.min(m, 50) / 50 * (hh - 50);
      g.strokeStyle = '#c2410c'; g.lineWidth = 2; g.beginPath();
      for (let r = 0; r <= 0.98; r += 0.005) { const px = X(r), py = Y(Core.wMult(r)); r === 0 ? g.moveTo(px, py) : g.lineTo(px, py); }
      g.stroke();
      g.fillStyle = '#c2410c'; g.beginPath(); g.arc(X(rho.get()), Y(Core.wMult(rho.get())), 6, 0, 7); g.fill();
    };
    const go = () => {
      const r = rho.get(), allowed = rm.get() * (n.get() - f.get()) / n.get();
      out.innerHTML = `At ρ = ${r.toFixed(2)}, a request spends <b>${Core.wMult(r).toFixed(1)}×</b> its service time in the system.<br>With ${n.get()} clusters and ${f.get()} lost, survivors take ${(n.get() / (n.get() - f.get())).toFixed(2)}× load. To stay under ρ = ${rm.get().toFixed(2)} afterwards, steady-state utilisation must be ≤ <b>${allowed.toFixed(2)}</b>.`;
      draw();
    };
    rho = slider(el, 'Utilisation ρ', 0.05, 0.99, 0.01, 0.7, (v) => v.toFixed(2), go);
    n = slider(el, 'Clusters (n)', 2, 6, 1, 3, (v) => v, go);
    f = slider(el, 'Clusters lost (f)', 1, 2, 1, 1, (v) => v, go);
    rm = slider(el, 'Max ρ you tolerate', 0.5, 0.95, 0.01, 0.8, (v) => v.toFixed(2), go);
    go();
  };

  W.drain = (el) => {
    title(el, 'Try it: how long to catch up?');
    const out = outBox(el);
    let rho, T;
    const go = () => {
      const d = Core.drain(T.get(), rho.get());
      out.innerHTML = `A ${T.get()} s pause at ρ = ${rho.get().toFixed(2)} leaves a backlog that takes <b>${dur(d / 60)}</b> to drain (${(d / T.get()).toFixed(1)}× the outage).`;
    };
    rho = slider(el, 'Steady-state ρ', 0.1, 0.98, 0.01, 0.8, (v) => v.toFixed(2), go);
    T = slider(el, 'Outage / pause (s)', 5, 600, 5, 30, (v) => v + ' s', go);
    go();
  };

  /* ---------- Chapter 6 ---------- */
  W.retry = (el) => {
    title(el, 'Try it: retry amplification');
    const out = outBox(el);
    let f, r, d, b;
    const go = () => {
      const m = Core.retryMult(f.get(), r.get(), d.get());
      out.innerHTML = `Per-call failure probability ${f.get().toFixed(2)}, ${r.get()} retries, ${d.get()} layers each retrying: the bottom service sees <b>${m.toFixed(1)}×</b> the base load.<br>With a global retry budget of ${(b.get() * 100).toFixed(0)}% of traffic, amplification is capped at <b>${(1 + b.get()).toFixed(2)}×</b>.`;
    };
    f = slider(el, 'Failure probability', 0, 1, 0.05, 1, (v) => v.toFixed(2), go);
    r = slider(el, 'Retries per layer', 0, 5, 1, 2, (v) => v, go);
    d = slider(el, 'Layers that retry', 1, 6, 1, 3, (v) => v, go);
    b = slider(el, 'Retry budget', 0, 0.5, 0.05, 0.1, (v) => (v * 100).toFixed(0) + '%', go);
    go();
  };

  W.meta = (el) => {
    title(el, 'Play it: a blip, and what keeps it alive');
    const state = { retry: true, budget: false, shed: false };
    const btns = h('div', { class: 'btns' });
    const names = { retry: 'Clients retry (up to 2×)', budget: 'Retry budget 10%', shed: 'Load shedding' };
    const out = outBox(el);
    const cv = canvas(el, 640, 260);
    el.append(h('div', { class: 'legend' }, 'Solid: goodput (successful work/s). Dashed: offered load including retries. Shaded band: the 8-second trigger. Capacity = 100/s, normal load = 70/s.'));
    const draw = (data) => {
      const g = cv.getContext('2d'), w = cv.width, hh = cv.height, col = ink();
      g.clearRect(0, 0, w, hh);
      const maxY = 320, X = (t) => 40 + (t / (data.length - 1)) * (w - 55), Y = (v) => hh - 25 - (Math.min(v, maxY) / maxY) * (hh - 40);
      g.fillStyle = 'rgba(194,65,12,.15)';
      const s0 = data.findIndex((d) => d.spike > 0), s1 = data.length - 1 - [...data].reverse().findIndex((d) => d.spike > 0);
      g.fillRect(X(s0), 10, X(s1) - X(s0), hh - 35);
      g.strokeStyle = col; g.globalAlpha = 0.4; g.beginPath(); g.moveTo(40, 10); g.lineTo(40, hh - 25); g.lineTo(w - 10, hh - 25); g.stroke();
      g.setLineDash([2, 4]); g.beginPath(); g.moveTo(40, Y(100)); g.lineTo(w - 10, Y(100)); g.stroke(); g.setLineDash([]);
      g.globalAlpha = 1; g.fillStyle = col; g.font = '11px sans-serif'; g.fillText('capacity', w - 62, Y(100) - 4); g.fillText('time →', w - 50, hh - 8);
      const line = (key, color, dash) => { g.strokeStyle = color; g.lineWidth = 2; g.setLineDash(dash || []); g.beginPath(); data.forEach((d, i) => { i ? g.lineTo(X(i), Y(d[key])) : g.moveTo(X(i), Y(d[key])); }); g.stroke(); g.setLineDash([]); };
      line('offered', '#64748b', [5, 4]); line('goodput', '#c2410c');
    };
    const run = () => {
      const data = Core.simulate({ r: state.retry ? 2 : 0, budget: state.budget, shed: state.shed });
      draw(data);
      const end = data.slice(-10).reduce((s, d) => s + d.goodput, 0) / 10;
      const min = Math.min(...data.slice(15).map((d) => d.goodput));
      out.innerHTML = end < 50
        ? `<b>Metastable collapse.</b> The 8-second trigger ended long ago, yet goodput is ~${end.toFixed(0)}/s against 70/s demanded. Retries keep the system in the bad state.`
        : `<b>Recovered.</b> Goodput dipped to ${min.toFixed(0)}/s during the blip and returned to ~${end.toFixed(0)}/s.`;
    };
    Object.keys(names).forEach((k) => {
      const bt = h('button', {}, names[k]);
      const sync = () => bt.classList.toggle('on', state[k]);
      bt.addEventListener('click', () => { state[k] = !state[k]; sync(); run(); });
      sync(); btns.append(bt);
    });
    el.insertBefore(btns, out);
    run();
  };

  /* ---------- Chapter 9 ---------- */
  W.burn = (el) => {
    title(el, 'Try it: error budget & burn rate');
    const out = outBox(el);
    let x, days, e;
    const go = () => {
      const slo = aFromNines(x.get()), budgetMin = (1 - slo) * days.get() * 1440;
      const burn = e.get() / 100 / (1 - slo);
      out.innerHTML = `SLO <b>${pct(slo, 3)}</b> over ${days.get()} days ⇒ budget of <b>${dur(budgetMin)}</b> of full outage.<br>Current error rate ${e.get().toFixed(2)}% ⇒ burn rate <b>${burn.toFixed(1)}×</b>. ${burn > 1 ? `Budget exhausted in <b>${dur((days.get() * 1440) / burn)}</b>. One hour at this rate spends <b>${((burn / (days.get() * 24)) * 100).toFixed(1)}%</b> of the whole budget.` : 'You are inside budget.'}`;
    };
    x = slider(el, 'SLO (nines)', 2, 4.5, 0.1, 3, (v) => v.toFixed(1), go);
    days = slider(el, 'Window (days)', 7, 90, 1, 30, (v) => v, go);
    e = slider(el, 'Error rate right now', 0, 10, 0.05, 1.44, (v) => v.toFixed(2) + '%', go);
    go();
  };


  /* ---------- Intuition widgets ---------- */
  W.downtime = (el) => {
    title(el, 'Try it: how big is a nine?');
    const out = outBox(el);
    let x;
    const go = () => {
      const U = Math.pow(10, -x.get());
      const yr = U * YEAR_MIN, mo = U * 30 * 1440, day = U * 1440;
      out.innerHTML = `Availability <b>${pct(1 - U, 4)}</b> allows:<br>• <b>${dur(yr)}</b> down per year<br>• <b>${dur(mo)}</b> per 30 days<br>• <b>${dur(day)}</b> per day<br>• in "incident" terms: about <b>${(yr / 30).toFixed(1)}</b> thirty-minute incidents a year.`;
    };
    x = slider(el, 'Number of nines', 1, 6, 0.1, 3, (v) => v.toFixed(1), go);
    go();
  };

  W.dots = (el) => {
    title(el, 'Try it: 1,000 requests through the chain');
    const out = outBox(el);
    const btns = h('div', { class: 'btns' });
    const again = h('button', {}, 'Send another 1,000');
    btns.append(again);
    const grid = h('div', { class: 'dotgrid' });
    const legend = h('div', { class: 'legend' }, 'Each dot is one request. Grey: it passed every hop. Red: it failed at some hop.');
    const tallyTitle = h('div', { class: 'tallytitle' }, 'Where the failed requests died (one column per hop, one block per request):');
    const tally = h('div', { class: 'tally' });
    el.append(btns, grid, legend, tallyTitle, tally);
    let n, x;
    const go = () => {
      const a = aFromNines(x.get()), nn = n.get(), U = 1 - a;
      const diedAt = new Array(nn).fill(0);
      let failed = 0;
      grid.textContent = '';
      for (let i = 0; i < 1000; i++) {
        let at = -1;
        for (let k = 0; k < nn; k++) if (Math.random() > a) { at = k; break; }
        if (at >= 0) { failed++; diedAt[at]++; }
        grid.append(h('i', { class: at >= 0 ? 'bad' : '' }));
      }
      tally.textContent = '';
      diedAt.forEach((c, k) => {
        const col = h('div', { class: 'col' });
        for (let b = 0; b < Math.min(c, 10); b++) col.append(h('b', {}));
        col.append(h('span', {}, nn <= 20 || (k + 1) % 5 === 0 ? String(k + 1) : '\u00a0'));
        tally.append(col);
      });
      out.innerHTML = `Each hop is down ${(U * 100).toFixed(3)}% of the time, so it kills about <b>${(1000 * U).toFixed(1)}</b> of every 1,000 requests that reach it. With ${nn} hops those bites add up to about <b>${(1000 * nn * U).toFixed(1)}</b>. In this sample, <b>${failed}</b> of 1,000 failed. (Exact formula: ${(1000 * (1 - Math.pow(a, nn))).toFixed(1)}.)`;
    };
    n = slider(el, 'Hops in series', 1, 40, 1, 20, (v) => v, go);
    x = slider(el, 'Per-hop nines', 1.5, 4, 0.1, 3, (v) => v.toFixed(1), go);
    again.addEventListener('click', go);
    go();
  };

  W.bulbs = (el) => {
    title(el, 'Watch it happen: 1,000 bulbs');
    const out = outBox(el);
    const grid = h('div', { class: 'dotgrid' });
    const legend = h('div', { class: 'legend' }, 'Grey dot: bulb still on. Red ring: burned out. Every bulb has its own random lifetime, fixed for this page, so sliding the day shows the same bulbs failing in order.');
    el.append(grid, legend);
    function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    const rnd = mulberry32(20261120);
    const u = [];
    for (let i = 0; i < 1000; i++) u.push(rnd() + 1e-9);
    const dots = u.map(() => { const d = h('i'); grid.append(d); return d; });
    let M, day;
    const go = () => {
      const m = M.get(), t = day.get();
      let alive = 0;
      dots.forEach((d, i) => { const dead = -m * Math.log(u[i]) <= t; d.className = dead ? 'dead' : ''; if (!dead) alive++; });
      const x = t / m;
      out.innerHTML = `Day <b>${t}</b> is <b>${x.toFixed(2)}</b> average lifetimes. <b>${alive}</b> of 1,000 bulbs are still on. The formula 1,000 × e<sup>−${x.toFixed(2)}</sup> predicts <b>${(1000 * Math.exp(-x)).toFixed(0)}</b>.`;
    };
    M = slider(el, 'Average lifetime (days)', 200, 2000, 100, 1000, (v) => v, go);
    day = slider(el, 'Day', 0, 3000, 10, 1000, (v) => v, go);
    go();
  };

  W.survival = (el) => {
    title(el, 'Try it: how long does a part last?');
    const out = outBox(el);
    const holder = h('div');
    el.append(holder);
    let mtbf, t;
    const go = () => {
      const M = mtbf.get(), T = t.get(), R = (v) => Math.exp(-v / M);
      const Wd = 640, Hd = 226, L = 44, B = 42, xmax = 10;
      const X = (v) => L + (v / xmax) * (Wd - L - 14), Y = (p) => Hd - B - p * (Hd - B - 12);
      let pts = '';
      for (let v = 0; v <= xmax + 1e-9; v += 0.1) pts += `${X(v).toFixed(1)},${Y(R(v)).toFixed(1)} `;
      const dot = (v, col) => `<circle cx="${X(v).toFixed(1)}" cy="${Y(R(v)).toFixed(1)}" r="6" fill="${col}"/>`;
      let ticks = '';
      for (let v = 0; v <= xmax; v += 2) ticks += `<text x="${X(v)}" y="${Hd - 24}" text-anchor="middle" font-size="11" fill="currentColor">${v}</text>`;
      [0, 0.5, 1].forEach((p) => { ticks += `<text x="${L - 6}" y="${Y(p) + 4}" text-anchor="end" font-size="11" fill="currentColor">${p * 100}%</text><line x1="${L}" x2="${Wd - 14}" y1="${Y(p)}" y2="${Y(p)}" stroke="currentColor" opacity=".15"/>`; });
      holder.innerHTML = `<svg viewBox="0 0 ${Wd} ${Hd}" style="width:100%;height:auto;color:inherit">
        ${ticks}
        <text x="${(L + Wd) / 2}" y="${Hd - 6}" text-anchor="middle" font-size="12" fill="currentColor">time elapsed (years)</text>
        <polyline points="${pts}" fill="none" stroke="#c2410c" stroke-width="3"/>
        ${M <= xmax ? dot(M, '#2563eb') : ''}${dot(T, '#16a34a')}</svg>`;
      out.innerHTML = `Failure rate λ = 1 ÷ MTBF = <b>${(1 / M).toFixed(2)}</b> per year.<br>After <b>${T}</b> ${T === 1 ? 'year' : 'years'}, <b>${(R(T) * 100).toFixed(1)}%</b> of parts are still working (green dot).<br>After one full MTBF (${M} years, blue dot), only <b>${(Math.exp(-1) * 100).toFixed(1)}%</b> are: an MTBF is an average, not a guarantee.`;
    };
    mtbf = slider(el, 'MTBF (years)', 0.5, 10, 0.5, 2, (v) => v.toFixed(1), go);
    t = slider(el, 'Time elapsed (years)', 0, 10, 0.25, 1, (v) => v.toFixed(2), go);
    go();
  };

  W.little = (el) => {
    title(el, "Try it: Little's Law at the pool");
    const out = outBox(el);
    const cv = canvas(el, 640, 70);
    let lam, w, pool;
    const go = () => {
      const L = lam.get() * w.get() / 1000, P = pool.get();
      const g = cv.getContext('2d'), W_ = cv.width;
      g.clearRect(0, 0, W_, 70);
      const scale = (W_ - 20) / Math.max(L, P) / 1.05;
      g.fillStyle = 'rgba(100,116,139,.25)'; g.fillRect(10, 12, P * scale, 22);
      g.fillStyle = L > P ? '#c2410c' : '#16a34a'; g.fillRect(10, 12, Math.min(L, P) * scale, 22);
      if (L > P) { g.fillStyle = 'rgba(194,65,12,.55)'; g.fillRect(10 + P * scale, 12, (L - P) * scale, 22); }
      g.fillStyle = ink(); g.font = '12px sans-serif';
      g.fillText(`pool = ${P}`, 10, 52); g.fillText(`needed = ${L.toFixed(1)}`, 10 + Math.min(L, Math.max(L, P)) * scale - 70, 64);
      out.innerHTML = L <= P
        ? `Concurrency needed: ${lam.get()}/s × ${w.get()} ms = <b>${L.toFixed(1)}</b> in flight. The pool of ${P} has <b>${((1 - L / P) * 100).toFixed(0)}%</b> spare.`
        : `Concurrency needed: ${lam.get()}/s × ${w.get()} ms = <b>${L.toFixed(0)}</b>, but the pool holds ${P}. <b>${(lam.get() - P / (w.get() / 1000)).toFixed(0)} requests/s</b> now queue, and queueing makes W larger, which makes the need larger still.`;
    };
    lam = slider(el, 'Arrival rate λ (req/s)', 10, 2000, 10, 500, (v) => v, go);
    w = slider(el, 'Time in system W (ms)', 5, 3000, 5, 40, (v) => v + ' ms', go);
    pool = slider(el, 'Pool size', 10, 600, 10, 200, (v) => v, go);
    go();
  };

  W.phi = (el) => {
    title(el, 'Try it: how suspicious is the silence?');
    const out = outBox(el);
    let mu, sd, t;
    const go = () => {
      const r = Core.phi(t.get(), mu.get(), sd.get());
      const ph = r.phi;
      const act = ph < 1 ? 'Do nothing; this is ordinary lateness.'
        : ph < 3 ? 'Stop sending <i>new</i> requests to it (cheap, reversible).'
        : ph < 8 ? 'Treat it as down for traffic; consider a restart.'
        : 'Very likely dead. A stateful failover is now defensible, <i>with fencing</i>.';
      out.innerHTML = `If it were healthy, silence this long would occur with probability <b>${r.p < 1e-6 ? r.p.toExponential(1) : (r.p * 100).toFixed(3) + '%'}</b>, so φ = <b>${isFinite(ph) ? ph.toFixed(1) : '∞'}</b> ("${isFinite(ph) ? ph.toFixed(1) : '∞'} nines of suspicion").<br>${act}<br><span class="legend">Assumes bell-shaped heartbeat gaps. Real networks have heavier tails, so true suspicion is lower than shown. Use measured quantiles.</span>`;
    };
    mu = slider(el, 'Usual heartbeat gap', 200, 2000, 50, 1000, (v) => v + ' ms', go);
    sd = slider(el, 'Jitter (std dev)', 20, 500, 10, 100, (v) => v + ' ms', go);
    t = slider(el, 'Silence so far', 0, 3000, 50, 1300, (v) => v + ' ms', go);
    go();
  };

  W.cobweb = (el) => {
    title(el, 'Play it: two valleys');
    const out = outBox(el);
    const cv = canvas(el, 640, 320);
    let lam, r, C, x0;
    const go = () => {
      const l = lam.get(), rr = r.get(), c = C.get();
      const xmax = Math.max(260, l * (1 + rr) * 1.25);
      const g = cv.getContext('2d'), w = cv.width, hh = cv.height, col = ink();
      const X = (v) => 45 + (v / xmax) * (w - 60), Y = (v) => hh - 30 - (v / xmax) * (hh - 45);
      g.clearRect(0, 0, w, hh);
      g.strokeStyle = col; g.globalAlpha = 0.4; g.lineWidth = 1;
      g.beginPath(); g.moveTo(45, 10); g.lineTo(45, hh - 30); g.lineTo(w - 10, hh - 30); g.stroke();
      g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(xmax), Y(xmax)); g.stroke(); g.setLineDash([]);
      g.globalAlpha = 1; g.fillStyle = col; g.font = '11px sans-serif';
      g.fillText('load seen next round', 50, 18); g.fillText('load seen now →', w - 105, hh - 12);
      g.strokeStyle = '#c2410c'; g.lineWidth = 2.5; g.beginPath();
      for (let v = 0; v <= xmax; v += 1) { const px = X(v), py = Y(Core.cobwebG(v, l, rr, c)); v ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.stroke();
      let x = Math.min(x0.get(), xmax), path = [x];
      g.strokeStyle = '#2563eb'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(X(x), Y(x));
      for (let i = 0; i < 40; i++) { const y = Core.cobwebG(x, l, rr, c); g.lineTo(X(x), Y(y)); g.lineTo(X(y), Y(y)); x = y; path.push(y); }
      g.stroke();
      const fx = Core.cobwebFixed(l, rr, c);
      fx.forEach((f) => { g.beginPath(); g.arc(X(f.x), Y(f.x), 6, 0, 7); g.fillStyle = f.stable ? '#16a34a' : '#fff'; g.fill(); g.strokeStyle = f.stable ? '#16a34a' : '#c2410c'; g.lineWidth = 2; g.stroke(); });
      const desc = fx.map((f) => `${f.x.toFixed(0)} (${f.stable ? 'stable' : 'tipping point'})`).join(', ') || 'none';
      const end = path[path.length - 1];
      out.innerHTML = `Fixed points: <b>${desc}</b>.<br>Starting from <b>${x0.get()}</b>/s of load, the system settles at <b>${end.toFixed(0)}</b>/s: ${end <= c ? '<b>recovered</b> (below capacity)' : '<b>collapsed</b> (retries hold the load above capacity)'}.<br><span class="legend">Orange: next-round load as a function of this-round load. Dashed: "next = now". Green dots: stable resting points. White dot: the hill between them. Blue: the path the system actually follows.</span>`;
    };
    lam = slider(el, 'Normal load (req/s)', 30, 120, 5, 70, (v) => v, go);
    r = slider(el, 'Retries per failure', 0, 3, 0.5, 2, (v) => v, go);
    C = slider(el, 'Capacity (req/s)', 60, 150, 5, 100, (v) => v, go);
    x0 = slider(el, 'Load right after the trigger', 40, 300, 5, 170, (v) => v, go);
    go();
  };

  function boot() {
    document.querySelectorAll('.widget[data-widget]').forEach((el) => {
      if (el.dataset.ready) return;
      const fn = W[el.dataset.widget];
      if (fn) {
        el.dataset.ready = '1'; fn(el);
        /* sliders first, then the result box, then any chart */
        let anchor = el.querySelector('h4');
        [...el.querySelectorAll(':scope > .row')].forEach((r) => { anchor.after(r); anchor = r; });
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
