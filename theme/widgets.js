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
