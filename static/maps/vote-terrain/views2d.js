/* Flat companion views for the vote terrain: Dots (every county on a swing axis, with state strips),
   Arrows (one arrow per county, its length the swing) and Scatter (change in Republican votes against
   change in Democratic votes). d3 + SVG. app.js owns the data, the state and the selection; each view
   only draws what it is given and reports the reader's gestures back through ctx.select().
   Exposes window.VT2D. */
(function () {
  const svgNS = 'http://www.w3.org/2000/svg';
  const INK = '#23306B', GRAPHITE = '#5B6168', RULE = 'rgba(35,48,107,0.28)', DIM = 0.35;

  function create(ctx) {
    const { el, geo, meta, fmt } = ctx;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const DUR = reduced ? 0 : 700;

    // ---------- shared geometry: county outlines, centroids, state borders (screen y = -projected y) ----------
    const ringsOf = (pc) => (Array.isArray(pc.p[0][0]) ? pc.p : [pc.p]);
    const shoelace = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
    const countyPath = {}, centroid = {}, bboxOf = {}, bestArea = {};
    for (const pc of geo.pieces) {
      let d = countyPath[pc.f] || '';
      for (const r of ringsOf(pc)) d += 'M' + r.map((q) => `${q[0].toFixed(1)},${(-q[1]).toFixed(1)}`).join('L') + 'Z';
      countyPath[pc.f] = d;
      const outer = ringsOf(pc)[0], a = Math.abs(shoelace(outer));
      if (!(bestArea[pc.f] > a)) { bestArea[pc.f] = a; const c = d3.polygonCentroid(outer.map((q) => [q[0], -q[1]])); centroid[pc.f] = c; }
      const bb = bboxOf[pc.f] || [Infinity, Infinity, -Infinity, -Infinity];
      for (const q of outer) { bb[0] = Math.min(bb[0], q[0]); bb[1] = Math.min(bb[1], -q[1]); bb[2] = Math.max(bb[2], q[0]); bb[3] = Math.max(bb[3], -q[1]); }
      bboxOf[pc.f] = bb;
    }
    // State borders: county edges shared by two counties in different states.
    const statePath = (() => {
      const seen = new Map(); let d = '';
      const key = (q) => q[0].toFixed(2) + ',' + q[1].toFixed(2);
      for (const pc of geo.pieces) {
        const st = meta[pc.f] && meta[pc.f].st;
        for (const r of ringsOf(pc)) for (let i = 0; i < r.length; i++) {
          const a = r[i], b = r[(i + 1) % r.length], ka = key(a), kb = key(b), k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
          const prev = seen.get(k);
          if (prev === undefined) seen.set(k, st);
          else if (prev !== st && prev !== null) { d += `M${a[0].toFixed(1)},${(-a[1]).toFixed(1)}L${b[0].toFixed(1)},${(-b[1]).toFixed(1)}`; seen.set(k, null); }
        }
      }
      return d;
    })();
    const W0 = (() => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const f in bboxOf) { const b = bboxOf[f]; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); } return [x0, y0, x1, y1]; })();
    const statesOf = (() => { const m = {}; for (const f in meta) { const st = meta[f].st; (m[st] ||= []).push(f); } return m; })();
    const countyName = (f) => meta[f] ? `${meta[f].n}${/^(AK|LA|DC)$/.test(meta[f].st) ? '' : ' County'}, ${meta[f].st}` : f;

    // ---------- frame: the region left free by the panel, key, balance box and timeline ----------
    const root = document.createElement('div'); root.className = 'v2d-root'; el.appendChild(root);
    const head = document.createElement('div'); head.className = 'v2d-head'; root.appendChild(head);
    const body = document.createElement('div'); body.className = 'v2d-body'; root.appendChild(body);
    const foot = document.createElement('div'); foot.className = 'v2d-foot'; root.appendChild(foot);
    const place = () => {
      const r = ctx.region(); Object.assign(root.style, { left: r.left + 'px', top: r.top + 'px', width: (r.right - r.left) + 'px', height: (r.bottom - r.top) + 'px' });
      // The drawing gets what the head and foot leave of the region.
      return { w: body.clientWidth || r.right - r.left, h: body.clientHeight || r.bottom - r.top - 60 };
    };
    const inSel = () => { const s = ctx.selection(); return s ? s.counties : null; };
    const shiftOf = (ev) => !!(ev && (ev.shiftKey || ev.metaKey || ev.ctrlKey));
    // Long press on touch adds to the selection, like shift-click.
    const longPress = (node, onLong) => {
      let t = null;
      node.addEventListener('touchstart', (ev) => { t = setTimeout(() => { t = null; onLong(ev); }, 550); }, { passive: true });
      for (const e of ['touchend', 'touchmove', 'touchcancel']) node.addEventListener(e, () => { clearTimeout(t); t = null; }, { passive: true });
    };
    const rows = () => ctx.rows();
    // A redraw in the middle of a drag (a resize, the play timer) would swap the brush out from under the pointer: hold it until the drag ends.
    const dragGuard = () => { const g = { on: false, held: null }; g.start = (ev) => { if (ev.sourceEvent) g.on = true; };
      g.end = (redraw) => { g.on = false; if (g.held !== null) setTimeout(() => { const a = g.held; g.held = null; if (a !== null) redraw(a); }); }; return g; };
    // The brush lies over the points so a drag can start anywhere; hover and click find the nearest point instead.
    const nearest = (svgNode, list, at, radius) => {
      const del = d3.Delaunay.from(list, (d) => at(d)[0], (d) => at(d)[1]);
      return (clientX, clientY) => {
        if (!list.length) return null;
        const b = svgNode.getBoundingClientRect(), x = clientX - b.left, y = clientY - b.top, i = del.find(x, y), d = list[i], p = at(d);
        return Math.hypot(p[0] - x, p[1] - y) <= radius(d) + 3 ? d : null;
      };
    };
    const hitLayer = (svg, near, onHit, hoverHtml) => {
      svg.on('mousemove.hit', (ev) => { const d = near()(ev.clientX, ev.clientY); if (!d) return ctx.hover(null); hoverHtml ? ctx.hoverHtml(hoverHtml(d), ev.clientX, ev.clientY) : ctx.hover(d.f, ev.clientX, ev.clientY); })
        .on('mouseleave.hit', () => ctx.hover(null));
      longPress(svg.node(), (ev) => { const t = ev.touches && ev.touches[0]; const d = t && near()(t.clientX, t.clientY); if (d) onHit(d, true); });
    };          // [{ f, st, v:[T,R,D], m, s, b:[T,R,D]|null }]

    // ======================================================================== Dots
    const dots = (() => {
      let svg, gBand, gRows, brushG, rowsBox, sortKey = 'median', nodes = new Map(), lastKey = '', nearFn = () => null;
      const guard = dragGuard();
      const RADIUS = 9;
      function build() {
        head.innerHTML = '<span class="v2d-label">Sort states by</span><div class="seg v2d-seg" role="group" aria-label="Sort states by">' +
          ['median', 'spread', 'counties', 'biggest'].map((k) => `<button data-sort="${k}" aria-pressed="${k === sortKey}">${{ median: 'Median', spread: 'Spread', counties: 'Counties', biggest: 'Biggest county' }[k]}</button>`).join('') + '</div>';
        head.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { sortKey = b.dataset.sort; head.querySelectorAll('[data-sort]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(true); }));
        body.innerHTML = '';
        svg = d3.select(body).append('svg').attr('class', 'v2d-band');
        gBand = svg.append('g'); brushG = svg.append('g').attr('class', 'brush');
        svg.append('g').attr('class', 'brush-note').append('text');
        hitLayer(svg, () => nearFn, (r, add) => ctx.select({ kind: 'counties', counties: [r.f] }, { add }));
        rowsBox = d3.select(body).append('div').attr('class', 'v2d-rows');
        gRows = rowsBox.append('svg');
      }
      function draw(animate = true) {
        if (guard.on) { guard.held = animate; return; }
        const { w, h } = place(), narrow = w < 520;
        const R = rows().filter((r) => r.v);
        const swingMode = ctx.mode() === 'swing';
        const val = (r) => (swingMode ? r.s : r.m);
        const data = R.filter((r) => val(r) != null);
        const ext = d3.quantile(data.map((r) => Math.abs(val(r))).sort(d3.ascending), 0.995) || 10;
        const max = swingMode ? Math.max(10, Math.ceil(ext / 5) * 5) : Math.max(20, Math.ceil(ext / 10) * 10);
        const bandH = narrow ? Math.min(h * 0.62, 420) : Math.min(260, Math.max(170, h * 0.36));
        const pad = { l: narrow ? 46 : 120, r: 22, t: 34, b: 26 };
        const vmax = d3.max(data, (r) => r.v[0]) || 1, rad = (r) => Math.max(0.9, RADIUS * Math.sqrt(r.v[0] / vmax));
        // Horizontal axis on wide screens; vertical on phones (the state list scrolls below).
        const span = narrow ? [pad.t, bandH - pad.b] : [pad.l, w - pad.r];
        const xs = d3.scaleLinear().domain(narrow ? [max, -max] : [-max, max]).range(span).clamp(true);
        svg.attr('width', w).attr('height', bandH);
        // Beeswarm: the value fixes one axis, a collision pass spreads the other.
        const key = state0() + '|' + w + '|' + bandH;
        const mid = narrow ? (pad.l + w - pad.r) / 2 : (pad.t + bandH - pad.b) / 2;
        const sim = data.map((r) => ({ r, rr: rad(r), a: xs(val(r)) }));
        if (key !== lastKey) {
          const fs = d3.forceSimulation(sim.map((n) => Object.assign(n, narrow ? { x: mid, y: n.a } : { x: n.a, y: mid })))
            .force(narrow ? 'y' : 'x', (narrow ? d3.forceY((n) => n.a) : d3.forceX((n) => n.a)).strength(1))
            .force(narrow ? 'x' : 'y', (narrow ? d3.forceX(mid) : d3.forceY(mid)).strength(0.05))
            .force('c', d3.forceCollide((n) => n.rr + 0.35).iterations(2)).stop();
          for (let i = 0; i < 160; i++) fs.tick();
          const lo = narrow ? pad.l : pad.t, hi = narrow ? w - pad.r : bandH - pad.b;
          for (const n of sim) { if (narrow) n.x = Math.max(lo, Math.min(hi, n.x)); else n.y = Math.max(lo, Math.min(hi, n.y)); nodes.set(n.r.f, { x: n.x, y: n.y }); }
          lastKey = key;
        }
        // Axis, zero line and labels.
        gBand.selectAll('.axis').remove();
        const ax = gBand.append('g').attr('class', 'axis');
        const ticks = xs.ticks(narrow ? 6 : 10);
        for (const t of ticks) {
          const p = xs(t);
          if (narrow) { ax.append('line').attr('x1', pad.l - 4).attr('x2', w - pad.r).attr('y1', p).attr('y2', p).attr('stroke', t === 0 ? INK : RULE).attr('stroke-width', t === 0 ? 1.5 : 0.6);
            ax.append('text').attr('x', pad.l - 7).attr('y', p + 4).attr('text-anchor', 'end').text(lab(t, swingMode)); }
          else { ax.append('line').attr('x1', p).attr('x2', p).attr('y1', pad.t - 6).attr('y2', bandH - pad.b + 4).attr('stroke', t === 0 ? INK : RULE).attr('stroke-width', t === 0 ? 1.5 : 0.6);
            ax.append('text').attr('x', p).attr('y', bandH - 6).attr('text-anchor', 'middle').text(lab(t, swingMode)); }
        }
        ax.append('text').attr('class', 'axis-title').attr('x', narrow ? 4 : pad.l).attr('y', 14)
          .text(swingMode ? `Swing since ${ctx.baselineLabel()}, points; dot area is votes` : `Margin, ${ctx.label()} (no earlier race for the same seat, so margin, not swing); dot area is votes`);
        const S = inSel();
        const circ = gBand.selectAll('circle.d').data(data, (r) => r.f);
        circ.exit().remove();
        const enter = circ.enter().append('circle').attr('class', 'd')
          .attr('cx', (r) => (nodes.get(r.f) || {}).x).attr('cy', (r) => (nodes.get(r.f) || {}).y).style('pointer-events', 'none');
        nearFn = nearest(svg.node(), data, (r) => { const n = nodes.get(r.f); return [n.x, n.y]; }, rad);
        const all = enter.merge(circ);
        all.attr('r', (r) => rad(r)).attr('fill', (r) => ctx.colour(val(r))).attr('stroke', 'rgba(35,48,107,.35)').attr('stroke-width', 0.3)
          .attr('opacity', (r) => (S && !S.has(r.f) ? DIM : 0.95));
        (animate && DUR ? all.transition().duration(DUR) : all).attr('cx', (r) => nodes.get(r.f).x).attr('cy', (r) => nodes.get(r.f).y);
        // Brush along the value axis: live count and votes; the selection on release.
        const note = svg.select('.brush-note text').attr('class', 'brush-label').text('');
        const brush = (narrow ? d3.brushY().extent([[pad.l, pad.t], [w - pad.r, bandH - pad.b]]) : d3.brushX().extent([[pad.l, pad.t], [w - pad.r, bandH - pad.b]]))
          .on('brush', (ev) => { if (!ev.selection) return; const [lo, hi] = rangeOf(ev.selection); const c = data.filter((r) => val(r) >= lo && val(r) <= hi);
            const v = d3.sum(c, (r) => r.v[0]); note.attr('x', narrow ? w - pad.r : (ev.selection[0] + ev.selection[1]) / 2).attr('y', narrow ? ev.selection[0] - 4 : pad.t + 14)
              .attr('text-anchor', narrow ? 'end' : 'middle').text(`${fmt(c.length)} counties, ${fmt(v)} votes (${lab(lo, swingMode)} to ${lab(hi, swingMode)})`); })
          .on('start', guard.start)
          .on('end', (ev) => { if (!ev.sourceEvent) return; guard.end(draw);
            if (!ev.selection) { note.text(''); const r = nearFn(ev.sourceEvent.clientX, ev.sourceEvent.clientY); if (r) ctx.select({ kind: 'counties', counties: [r.f] }, { add: shiftOf(ev.sourceEvent) }); return; }
            const [lo, hi] = rangeOf(ev.selection); const c = data.filter((r) => val(r) >= lo && val(r) <= hi).map((r) => r.f);
            brushG.call(brush.move, null); note.text('');
            if (c.length) ctx.select({ kind: 'counties', counties: c, rule: `r:${swingMode ? 's' : 'm'}:${lo.toFixed(1)}:${hi.toFixed(1)}` }, { add: shiftOf(ev.sourceEvent) }); });
        const rangeOf = (selPx) => { const a = xs.invert(selPx[0]), b = xs.invert(selPx[1]); return [Math.min(a, b), Math.max(a, b)]; };
        brushG.call(brush); brushG.raise(); svg.select('.brush-note').raise();
        // State strips.
        drawRows(data, val, xs, narrow, w, h - bandH - 8, swingMode, S);
      }
      const lab = (t0, swingMode) => { const t = Math.round(t0 * 10) / 10; return t === 0 ? (swingMode ? '0' : 'even') : swingMode ? `${Math.abs(t)} ${t > 0 ? 'D' : 'R'}` : `${t > 0 ? 'D' : 'R'}+${Math.abs(t)}`; };
      function drawRows(data, val, xs, narrow, w, hAvail, swingMode, S) {
        rowsBox.style('height', Math.max(80, hAvail) + 'px');
        const by = d3.group(data, (r) => r.st);
        let list = [...by].map(([st, rs]) => { const vs = rs.map(val).sort(d3.ascending), big = rs.reduce((a, b) => (b.v[0] > a.v[0] ? b : a));
          return { st, rs, med: d3.median(vs), q1: d3.quantile(vs, 0.25), q3: d3.quantile(vs, 0.75), n: rs.length, big: val(big) }; });
        const sorter = { median: (a, b) => b.med - a.med, spread: (a, b) => (b.q3 - b.q1) - (a.q3 - a.q1), counties: (a, b) => b.n - a.n, biggest: (a, b) => b.big - a.big }[sortKey];
        list.sort(sorter);
        const RH = narrow ? 22 : 18, padL = narrow ? 120 : 120;
        const xr = narrow ? d3.scaleLinear().domain(xs.domain().slice().reverse()).range([padL, w - 22]).clamp(true) : xs;
        gRows.attr('width', w).attr('height', list.length * RH + 8);
        const g = gRows.selectAll('g.row').data(list, (d) => d.st);
        g.exit().remove();
        const ge = g.enter().append('g').attr('class', 'row');
        ge.append('rect').attr('class', 'hit').attr('x', 0).attr('height', RH).attr('fill', 'transparent');
        ge.append('text').attr('class', 'st').attr('x', 6);
        ge.append('line').attr('class', 'zero');
        ge.append('g').attr('class', 'ticks');
        ge.append('rect').attr('class', 'med');
        const gm = ge.merge(g);
        (DUR ? gm.transition().duration(DUR) : gm).attr('transform', (d, i) => `translate(0,${4 + i * RH})`);
        gm.select('.hit').attr('width', w).on('click', (ev, d) => ctx.select({ kind: 'states', states: [d.st] }, { add: shiftOf(ev) }))
          .on('mousemove', (ev, d) => ctx.hoverHtml(`<b>${ctx.stateName(d.st)}</b><br>${d.n} counties${d.n >= 5 ? `<br>Median ${lab(Math.round(d.med * 10) / 10, swingMode)}; middle half ${lab(Math.round(d.q1 * 10) / 10, swingMode)} to ${lab(Math.round(d.q3 * 10) / 10, swingMode)}` : ''}<br><span style="color:${GRAPHITE}">Click to select its counties</span>`, ev.clientX, ev.clientY))
          .on('mouseleave', () => ctx.hover(null)).style('cursor', 'pointer');
        gm.select('.st').attr('y', RH / 2 + 4).text((d) => `${d.st}  ${d.n >= 5 ? lab(Math.round(d.med * 10) / 10, swingMode) : ''}`)
          .attr('font-weight', (d) => (S && d.rs.some((r) => S.has(r.f)) ? 700 : 400));
        gm.select('.zero').attr('x1', xr(0)).attr('x2', xr(0)).attr('y1', 2).attr('y2', RH - 2).attr('stroke', RULE);
        gm.each(function (d) {
          const t = d3.select(this).select('.ticks').selectAll('line').data(d.rs, (r) => r.f);
          t.exit().remove();
          t.enter().append('line').attr('y1', RH * 0.25).attr('y2', RH * 0.75).merge(t)
            .attr('x1', (r) => xr(val(r))).attr('x2', (r) => xr(val(r))).attr('stroke', (r) => ctx.colour(val(r))).attr('stroke-width', 1.2)
            .attr('opacity', (r) => (S && !S.has(r.f) ? DIM : 0.9));
        });
        gm.select('.med').attr('display', (d) => (d.n >= 5 ? null : 'none')).attr('x', (d) => xr(d.med) - 1.5).attr('y', 1).attr('width', 3).attr('height', RH - 2).attr('fill', INK);
      }
      return { build, draw };
    })();

    // ======================================================================== Arrows
    const arrows = (() => {
      let svg, g, zoom, gMap, gArr, zoomedSt = null, byVotes = false, exceptions = false, k0 = 1;
      const PX_PER_POINT = 0.8;            // arrow length per point of swing, in map units at national scale
      function build() {
        head.innerHTML = '<div class="seg v2d-seg" role="group" aria-label="Arrow options"><button data-a="votes" aria-pressed="false">Width by votes</button><button data-a="exc" aria-pressed="false">Only the exceptions</button></div>' +
          '<span class="v2d-ref" aria-hidden="true"></span>';
        head.querySelector('[data-a="votes"]').addEventListener('click', (e) => { byVotes = !byVotes; e.currentTarget.setAttribute('aria-pressed', byVotes); draw(false); });
        head.querySelector('[data-a="exc"]').addEventListener('click', (e) => { exceptions = !exceptions; e.currentTarget.setAttribute('aria-pressed', exceptions); draw(true); });
        body.innerHTML = '';
        svg = d3.select(body).append('svg').attr('class', 'v2d-map');
        g = svg.append('g'); gMap = g.append('g'); gArr = g.append('g');
        gMap.selectAll('path.c').data(Object.keys(countyPath)).join('path').attr('class', 'c').attr('d', (f) => countyPath[f])
          .attr('fill', '#DCE1E2').attr('stroke', '#E8ECEC').attr('stroke-width', 0.25)
          .on('click', (ev, f) => {
            if (shiftOf(ev)) { ctx.select({ kind: 'counties', counties: [f] }, { add: true }); return; }
            const st = meta[f] && meta[f].st;
            if (zoomedSt !== st) zoomTo(st); else ctx.select({ kind: 'counties', counties: [f] });
          })
          .on('mousemove', (ev, f) => ctx.hover(f, ev.clientX, ev.clientY)).on('mouseleave', () => ctx.hover(null));
        gMap.append('path').attr('class', 'states').attr('d', statePath).attr('fill', 'none').attr('stroke', 'rgba(35,48,107,.5)').attr('stroke-width', 0.6).attr('pointer-events', 'none');
        zoom = d3.zoom().scaleExtent([1, 14]).on('zoom', (ev) => { g.attr('transform', ev.transform); const k = ev.transform.k / k0; gArr.selectAll('path').attr('stroke-width', (r) => width(r) / k); svg.selectAll('.labels').attr('display', ev.transform.k > k0 * 1.6 ? null : 'none'); });
        svg.call(zoom).on('dblclick.zoom', null);
        svg.on('click', (ev) => { if (ev.target === svg.node() && zoomedSt) { zoomedSt = null; reset(); } });
      }
      let vmax = 1;
      const width = (r) => (byVotes ? 0.4 + 3.2 * Math.sqrt(r.v[0] / vmax) : 0.9);
      const fit = () => { const { w, h } = place(); const sx = (w - 20) / (W0[2] - W0[0]), sy = (h - 20) / (W0[3] - W0[1]); k0 = Math.min(sx, sy);
        return d3.zoomIdentity.translate((w - (W0[2] - W0[0]) * k0) / 2 - W0[0] * k0, (h - (W0[3] - W0[1]) * k0) / 2 - W0[1] * k0).scale(k0); };
      const reset = () => { const t = fit(); svg.transition().duration(DUR).call(zoom.transform, t); zoom.scaleExtent([k0, k0 * 14]); };
      function zoomTo(st) {
        zoomedSt = st; const fs = statesOf[st] || []; if (!fs.length) return;
        let b = [Infinity, Infinity, -Infinity, -Infinity]; for (const f of fs) { const q = bboxOf[f]; b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])]; }
        const { w, h } = place(), k = Math.min((w - 60) / (b[2] - b[0]), (h - 60) / (b[3] - b[1]), k0 * 14);
        svg.transition().duration(DUR).call(zoom.transform, d3.zoomIdentity.translate(w / 2 - k * (b[0] + b[2]) / 2, h / 2 - k * (b[1] + b[3]) / 2).scale(k));
      }
      // Leaning left toward Democrats, right toward Republicans, at 45 degrees; length proportional to swing.
      const arrowD = (r, s) => {
        const c = centroid[r.f]; if (!c || s == null) return 'M0,0';
        const L = Math.abs(s) * PX_PER_POINT, dir = s >= 0 ? -1 : 1, dx = dir * L * Math.SQRT1_2, dy = -L * Math.SQRT1_2;
        const x1 = c[0] + dx, y1 = c[1] + dy, hl = Math.min(2.2, 0.25 + L * 0.28), a = Math.atan2(dy, dx);
        const h1 = [x1 - hl * Math.cos(a - 0.5), y1 - hl * Math.sin(a - 0.5)], h2 = [x1 - hl * Math.cos(a + 0.5), y1 - hl * Math.sin(a + 0.5)];
        return `M${c[0].toFixed(1)},${c[1].toFixed(1)}L${x1.toFixed(1)},${y1.toFixed(1)}M${h1[0].toFixed(1)},${h1[1].toFixed(1)}L${x1.toFixed(1)},${y1.toFixed(1)}L${h2[0].toFixed(1)},${h2[1].toFixed(1)}`;
      };
      function draw(animate = true) {
        const { w, h } = place();
        svg.attr('width', w).attr('height', h);
        if (!draw.fitted || draw.fitted !== w + 'x' + h) { draw.fitted = w + 'x' + h; svg.call(zoom.transform, fit()); zoom.scaleExtent([k0, k0 * 14]); }
        const R = rows().filter((r) => r.v && r.s != null);
        vmax = d3.max(R, (r) => r.v[0]) || 1;
        const toD = R.filter((r) => r.s > 0).length, toR = R.filter((r) => r.s < 0).length, majority = toD >= toR ? 1 : -1;
        const shown = exceptions ? R.filter((r) => Math.sign(r.s) !== majority) : R;
        const S = inSel(), k = (d3.zoomTransform(svg.node()).k || k0) / k0;
        gMap.selectAll('path.c').attr('fill', (f) => (S && S.has(f) ? '#C9D1E6' : '#DCE1E2'));
        const p = gArr.selectAll('path').data(shown, (r) => r.f);
        p.exit().remove();
        const pe = p.enter().append('path').attr('fill', 'none').attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').attr('d', (r) => arrowD(r, 0))
          .on('mousemove', (ev, r) => ctx.hover(r.f, ev.clientX, ev.clientY)).on('mouseleave', () => ctx.hover(null))
          .on('click', (ev, r) => ctx.select({ kind: 'counties', counties: [r.f] }, { add: shiftOf(ev) }));
        pe.each(function (r) { longPress(this, () => ctx.select({ kind: 'counties', counties: [r.f] }, { add: true })); });
        const all = pe.merge(p).attr('stroke', (r) => ctx.colour(r.s)).attr('stroke-width', (r) => width(r) / k)
          .attr('opacity', (r) => (S && !S.has(r.f) ? DIM : 0.92));
        (animate && DUR ? all.transition().duration(DUR) : all).attr('d', (r) => arrowD(r, r.s));
        // Reference arrow, drawn at the map's current scale.
        const L = 20 * PX_PER_POINT * (d3.zoomTransform(svg.node()).k || k0);
        head.querySelector('.v2d-ref').innerHTML = `<svg width="${Math.ceil(L * 0.75 + 16)}" height="${Math.ceil(L * 0.75 + 10)}" style="vertical-align:middle"><path d="M${L * 0.71 + 6},${L * 0.71 + 4}L6,4M6,${4 + Math.min(8, L * .3)}L6,4L${6 + Math.min(8, L * .3)},4" stroke="${INK}" stroke-width="1.5" fill="none"/></svg> 20 points toward the Democrat; ` +
          `${fmt(toD)} counties moved toward the Democrat, ${fmt(toR)} toward the Republican${exceptions ? '; only the exceptions shown' : ''}`;
        foot.textContent = `Arrows: swing since ${ctx.baselineLabel()}. Click a state to zoom in; click a county there to select it. Shift-click to add.`;
      }
      return { build, draw, reset: () => { zoomedSt = null; reset(); }, zoomTo };
    })();

    // ======================================================================== Scatter
    const scatter = (() => {
      let svg, g, gTrail, gPts, gGuides, brushG, raw = false, byState = false, prev = new Map(), nearFn = () => null, tipOf = () => '';
      const guard = dragGuard();
      function build() {
        head.innerHTML = '<div class="seg v2d-seg" role="group" aria-label="Axes"><button data-x="pct" aria-pressed="true">Percent change</button><button data-x="raw" aria-pressed="false">Votes</button></div>' +
          '<div class="seg v2d-seg" role="group" aria-label="Colour"><button data-k="margin" aria-pressed="true">Colour by margin</button><button data-k="state" aria-pressed="false">By state</button></div>';
        head.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => { raw = b.dataset.x === 'raw'; head.querySelectorAll('[data-x]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(true); }));
        head.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { byState = b.dataset.k === 'state'; head.querySelectorAll('[data-k]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(false); }));
        body.innerHTML = '';
        svg = d3.select(body).append('svg').attr('class', 'v2d-scatter');
        gGuides = svg.append('g').style('pointer-events', 'none'); gTrail = svg.append('g'); gPts = svg.append('g').style('pointer-events', 'none'); brushG = svg.append('g').attr('class', 'brush');
        hitLayer(svg, () => nearFn, (r, add) => ctx.select({ kind: 'counties', counties: [r.f] }, { add }), (r) => tipOf(r));
        foot.textContent = 'County totals cannot show individual voters switching: each point is the change in a county\'s Republican and Democratic vote counts.';
      }
      const stColour = (() => { const sts = Object.keys(statesOf).sort(); const m = {}; sts.forEach((s, i) => (m[s] = d3.interpolateRainbow(i / sts.length))); return (s) => m[s]; })();
      function draw(animate = true) {
        if (guard.on) { guard.held = animate; return; }
        const { w, h } = place();
        svg.attr('width', w).attr('height', h);
        const R = rows().filter((r) => r.v && r.b && r.b[1] > 0 && r.b[2] > 0);
        const dx = (r) => (raw ? r.v[1] - r.b[1] : (r.v[1] - r.b[1]) / r.b[1] * 100);
        const dy = (r) => (raw ? r.v[2] - r.b[2] : (r.v[2] - r.b[2]) / r.b[2] * 100);
        const narrow = w < 520, pad = { l: narrow ? 44 : 64, r: narrow ? 8 : 18, t: 18, b: 44 };
        const q = (arr, p) => d3.quantile(arr.slice().sort(d3.ascending), p);
        const xsV = R.map(dx), ysV = R.map(dy);
        // Each axis spans its own 0.5th to 99.5th percentile and zero, so the cloud fills the frame.
        const dom = (vs) => { let a = Math.min(q(vs, 0.005), 0), b = Math.max(q(vs, 0.995), 0); if (!isFinite(a) || !isFinite(b) || a === b) { a = -1; b = 1; } const p = (b - a) * 0.06; return [a - p, b + p]; };
        const [xlo, xhi] = dom(xsV), [ylo, yhi] = dom(ysV);
        const mk = (d, range) => (raw ? d3.scaleSymlog().constant(500) : d3.scaleLinear()).domain(d).range(range).clamp(true);
        const xs = mk([xlo, xhi], [pad.l, w - pad.r]), ys = mk([ylo, yhi], [h - pad.b, pad.t]);
        const vmax = d3.max(R, (r) => r.v[0]) || 1, rad = (r) => Math.max(1, 10 * Math.sqrt(r.v[0] / vmax));
        const beyond = R.filter((r) => dx(r) < xlo || dx(r) > xhi || dy(r) < ylo || dy(r) > yhi).length;
        // Guides: axes through zero, the diagonal (both parties changed by the same amount), plain quadrant labels.
        gGuides.selectAll('*').remove();
        const fmtT = (t) => (raw ? d3.format('~s')(t) : t + '%');
        for (const t of xs.ticks(7)) { gGuides.append('line').attr('x1', xs(t)).attr('x2', xs(t)).attr('y1', pad.t).attr('y2', h - pad.b).attr('stroke', RULE).attr('stroke-width', 0.5);
          gGuides.append('text').attr('class', 'tick').attr('x', xs(t)).attr('y', h - pad.b + 14).attr('text-anchor', 'middle').text(fmtT(t)); }
        for (const t of ys.ticks(7)) { gGuides.append('line').attr('y1', ys(t)).attr('y2', ys(t)).attr('x1', pad.l).attr('x2', w - pad.r).attr('stroke', RULE).attr('stroke-width', 0.5);
          gGuides.append('text').attr('class', 'tick').attr('x', pad.l - 6).attr('y', ys(t) + 4).attr('text-anchor', 'end').text(fmtT(t)); }
        gGuides.append('line').attr('x1', xs(0)).attr('x2', xs(0)).attr('y1', pad.t).attr('y2', h - pad.b).attr('stroke', INK).attr('stroke-width', 1.2);
        gGuides.append('line').attr('y1', ys(0)).attr('y2', ys(0)).attr('x1', pad.l).attr('x2', w - pad.r).attr('stroke', INK).attr('stroke-width', 1.2);
        const d0 = Math.max(xlo, ylo), d1 = Math.min(xhi, yhi);
        if (d1 > d0) gGuides.append('line').attr('x1', xs(d0)).attr('y1', ys(d0)).attr('x2', xs(d1)).attr('y2', ys(d1)).attr('stroke', INK).attr('stroke-dasharray', '4 4').attr('stroke-width', 0.8);
        gGuides.append('text').attr('class', 'axis-title').attr('x', (pad.l + w - pad.r) / 2).attr('y', h - 8).attr('text-anchor', 'middle')
          .text(narrow ? `Republican votes${raw ? '' : ', % change'}` : `Change in Republican votes since ${ctx.baselineLabel()}${raw ? '' : ', percent'}`);
        gGuides.append('text').attr('class', 'axis-title').attr('transform', `translate(14,${(pad.t + h - pad.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle')
          .text(narrow ? `Democratic votes${raw ? '' : ', % change'}` : `Change in Democratic votes${raw ? '' : ', percent'}`);
        const quads = [
          { k: 'ne', x: xhi, y: yhi, a: 'end', t: 'Both grew', f: (r) => dx(r) > 0 && dy(r) > 0 },
          { k: 'sw', x: xlo, y: ylo, a: 'start', t: 'Both fell', f: (r) => dx(r) < 0 && dy(r) < 0 },
          { k: 'nw', x: xlo, y: yhi, a: 'start', t: narrow ? 'D up, R down' : 'Democrats up, Republicans down', f: (r) => dx(r) <= 0 && dy(r) > 0 },
          { k: 'se', x: xhi, y: ylo, a: 'end', t: narrow ? 'R up, D down' : 'Republicans up, Democrats down', f: (r) => dx(r) > 0 && dy(r) <= 0 },
        ];
        for (const qd of quads) {
          gGuides.append('text').attr('class', 'quad').attr('x', xs(qd.x) + (qd.a === 'start' ? 8 : -8)).attr('y', ys(qd.y) + (qd.y === yhi ? 16 : -10))
            .attr('text-anchor', qd.a).text(qd.t).style('cursor', 'pointer').style('pointer-events', 'auto')
            .on('click', (ev) => ctx.select({ kind: 'counties', counties: R.filter(qd.f).map((r) => r.f), rule: 'q:' + qd.k }, { add: shiftOf(ev) }));
        }
        if (!narrow) gGuides.append('text').attr('class', 'tick').attr('x', xs(xhi) - 6).attr('y', ys(yhi) + 32).attr('text-anchor', 'end').text('dashed: both changed by the same share');
        if (beyond) gGuides.append('text').attr('class', 'tick').attr('x', w - pad.r).attr('y', pad.t - 4).attr('text-anchor', 'end').text(`${fmt(beyond)} counties beyond the axes are drawn at the edge`);
        // Points, with a short trail from where each sat in the previous view.
        const S = inSel(), pos = new Map(R.map((r) => [r.f, [xs(dx(r)), ys(dy(r))]]));
        gTrail.selectAll('*').interrupt().remove();
        if (animate && DUR && prev.size) {
          for (const r of R) { const a = prev.get(r.f), b = pos.get(r.f); if (a && (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) > 3) && r.v[0] > vmax * 0.004)
            gTrail.append('line').attr('x1', a[0]).attr('y1', a[1]).attr('x2', b[0]).attr('y2', b[1]).attr('stroke', GRAPHITE).attr('stroke-width', 0.7).attr('opacity', 0.5)
              .transition().delay(DUR).duration(1000).attr('opacity', 0).remove(); }
        }
        const c = gPts.selectAll('circle').data(R, (r) => r.f);
        c.exit().remove();
        const ce = c.enter().append('circle').attr('cx', (r) => (prev.get(r.f) || pos.get(r.f))[0]).attr('cy', (r) => (prev.get(r.f) || pos.get(r.f))[1]);
        tipOf = (r) => ctx.tipHtml(r.f) + `<br>Republican votes ${signedPct(r.v[1], r.b[1])}, Democratic ${signedPct(r.v[2], r.b[2])} since ${ctx.baselineLabel(r.st)}`;
        nearFn = nearest(svg.node(), R, (r) => pos.get(r.f), rad);
        const all = ce.merge(c).attr('r', rad).attr('fill', (r) => (byState ? stColour(r.st) : ctx.colour(r.m, true))).attr('fill-opacity', 0.8)
          .attr('stroke', 'rgba(35,48,107,.4)').attr('stroke-width', 0.3).attr('opacity', (r) => (S && !S.has(r.f) ? DIM : 1));
        (animate && DUR ? all.transition().duration(DUR) : all).attr('cx', (r) => pos.get(r.f)[0]).attr('cy', (r) => pos.get(r.f)[1]);
        all.sort((a, b) => b.v[0] - a.v[0]);
        prev = pos;
        // Box select.
        const brush = d3.brush().extent([[pad.l, pad.t], [w - pad.r, h - pad.b]]).on('start', guard.start).on('end', (ev) => {
          if (!ev.sourceEvent) return; guard.end(draw);
          if (!ev.selection) { const r = nearFn(ev.sourceEvent.clientX, ev.sourceEvent.clientY); if (r) ctx.select({ kind: 'counties', counties: [r.f] }, { add: shiftOf(ev.sourceEvent) }); return; }
          const [[x0, y0], [x1, y1]] = ev.selection;
          const sel = R.filter((r) => { const p = pos.get(r.f); return p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1; }).map((r) => r.f);
          brushG.call(brush.move, null);
          // The box goes into the link as a rule in percent units; a box drawn in vote units is kept as its counties.
          if (sel.length) ctx.select({ kind: 'counties', counties: sel, rule: raw ? undefined : 'b:' + [xs.invert(x0), xs.invert(x1), ys.invert(y1), ys.invert(y0)].map((v) => v.toFixed(1)).join(',') }, { add: shiftOf(ev.sourceEvent) });
        });
        brushG.call(brush);
        gGuides.raise();   // above the brush, but only the quadrant labels take the pointer
        // Quadrant counts, as plain sentences, for the selection or for every county shown.
        const base = S ? R.filter((r) => S.has(r.f)) : R;
        const n = (f) => base.filter(f).length;
        const cn = (k) => `${fmt(k)} ${k === 1 ? 'county' : 'counties'}`;
        ctx.viewNote(`Since ${ctx.baselineLabel()}, ${S ? 'in the selection' : 'of the ' + fmt(R.length) + ' counties shown'}: Democrats gained votes while Republicans lost them in ${cn(n(quads[2].f))}; ` +
          `the reverse in ${cn(n(quads[3].f))}; both parties gained in ${cn(n(quads[0].f))}; both lost in ${cn(n(quads[1].f))}.`);
      }
      const signedPct = (a, b) => { const p = (a - b) / b * 100; return (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(1) + '%'; };
      return { build, draw };
    })();

    // ======================================================================== Circles
    // Each county a circle, its area the votes (or the population it is apportioned for), nudged apart so
    // none overlap (positions precomputed by build_circles.mjs; ctx.circles() hands over the layout for the
    // election in view, or null while it loads). Drag draws a box; scroll or pinch zooms; Alt-drag or one
    // finger pans.
    const circles = (() => {
      let svg, g, gSt, gC, box, zoom, k0 = 1, cur = new Map(), lay = null;
      function build() {
        head.innerHTML = '<span class="v2d-ref" aria-hidden="true"></span>';
        body.innerHTML = '';
        svg = d3.select(body).append('svg').attr('class', 'v2d-map v2d-circles');
        g = svg.append('g'); gSt = g.append('g'); gC = g.append('g');
        gSt.append('path').attr('class', 'states').attr('d', statePath).attr('fill', 'none').attr('stroke', 'rgba(35,48,107,.22)').attr('stroke-width', 0.5).attr('pointer-events', 'none');
        box = svg.append('rect').attr('class', 'v2d-box').attr('fill', 'rgba(35,48,107,.08)').attr('stroke', INK).attr('stroke-dasharray', '3 3').attr('display', 'none');
        // Zoom takes the wheel, pinch and touch drags; a mouse drag is the box, unless Alt is held.
        zoom = d3.zoom().filter((ev) => ev.type === 'wheel' || ev.type.startsWith('touch') || (ev.type === 'mousedown' && ev.altKey && !ev.button))
          .on('zoom', (ev) => { g.attr('transform', ev.transform); gC.selectAll('circle').attr('stroke-width', 0.35 / (ev.transform.k / k0)); });
        svg.call(zoom).on('dblclick.zoom', null);
        const at = (ev) => { const b = svg.node().getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top]; };
        // Circle under the pointer, in map units.
        const hit = (ev) => { if (!lay) return null; const t = d3.zoomTransform(svg.node()), [x, y] = t.invert(at(ev)); let best = null, bd = Infinity;
          for (const [f, c] of cur) { const d = Math.hypot(c.x - x, c.y - y) - c.r; if (d < bd) { bd = d; best = f; } }
          return bd <= 2 / (t.k / k0) ? best : null; };
        let down = null;
        svg.on('pointerdown.box', (ev) => { if (ev.pointerType !== 'mouse' || ev.button || ev.altKey) return; down = at(ev); svg.node().setPointerCapture(ev.pointerId); })
          .on('pointermove.box', (ev) => {
            if (!down) { if (ev.pointerType === 'mouse') { const f = hit(ev); if (f) ctx.hover(f, ev.clientX, ev.clientY); else ctx.hover(null); } return; }
            const p = at(ev); if (Math.hypot(p[0] - down[0], p[1] - down[1]) < 5) return;
            ctx.hover(null);
            box.attr('display', null).attr('x', Math.min(p[0], down[0])).attr('y', Math.min(p[1], down[1])).attr('width', Math.abs(p[0] - down[0])).attr('height', Math.abs(p[1] - down[1]));
          })
          .on('pointerup.box', (ev) => {
            if (!down) return; const p = at(ev), d0 = down; down = null; box.attr('display', 'none');
            if (Math.hypot(p[0] - d0[0], p[1] - d0[1]) < 5) { const f = hit(ev); if (f) ctx.select({ kind: 'counties', counties: [f] }, { add: shiftOf(ev) }); else if (!shiftOf(ev) && ctx.selection()) ctx.select(null); return; }
            const t = d3.zoomTransform(svg.node()), [x0, y0] = t.invert([Math.min(p[0], d0[0]), Math.min(p[1], d0[1])]), [x1, y1] = t.invert([Math.max(p[0], d0[0]), Math.max(p[1], d0[1])]);
            const fs = [...cur].filter(([, c]) => c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1).map(([f]) => f);
            if (fs.length) ctx.select({ kind: 'counties', counties: fs }, { add: shiftOf(ev) });
          })
          .on('mouseleave.box', () => ctx.hover(null));
        // Touch: a tap selects, a long press adds.
        svg.on('click.tap', (ev) => { if (ev.pointerType && ev.pointerType !== 'mouse') { const f = hit(ev); if (f) ctx.select({ kind: 'counties', counties: [f] }); } });
        longPress(svg.node(), (ev) => { const tch = ev.touches && ev.touches[0]; const f = tch && hit(tch); if (f) ctx.select({ kind: 'counties', counties: [f] }, { add: true }); });
      }
      const fit = () => { const { w, h } = place(); const sx = (w - 16) / (W0[2] - W0[0]), sy = (h - 16) / (W0[3] - W0[1]); k0 = Math.min(sx, sy);
        return d3.zoomIdentity.translate((w - (W0[2] - W0[0]) * k0) / 2 - W0[0] * k0, (h - (W0[3] - W0[1]) * k0) / 2 - W0[1] * k0).scale(k0); };
      const reset = () => { const t = fit(); zoom.scaleExtent([k0 * 0.8, k0 * 24]); svg.transition().duration(DUR).call(zoom.transform, t); };
      function zoomTo(fs) {
        let b = [Infinity, Infinity, -Infinity, -Infinity];
        for (const f of fs) { const c = cur.get(f); if (c) b = [Math.min(b[0], c.x - c.r), Math.min(b[1], c.y - c.r), Math.max(b[2], c.x + c.r), Math.max(b[3], c.y + c.r)]; }
        if (!isFinite(b[0])) return;
        const { w, h } = place(), k = Math.min((w - 80) / Math.max(8, b[2] - b[0]), (h - 80) / Math.max(8, b[3] - b[1]), k0 * 24);
        svg.transition().duration(DUR).call(zoom.transform, d3.zoomIdentity.translate(w / 2 - k * (b[0] + b[2]) / 2, h / 2 - k * (b[1] + b[3]) / 2).scale(k));
      }
      function draw(animate = true) {
        const { w, h } = place();
        svg.attr('width', w).attr('height', h);
        if (!draw.fitted || draw.fitted !== w + 'x' + h) { draw.fitted = w + 'x' + h; svg.call(zoom.transform, fit()); zoom.scaleExtent([k0 * 0.8, k0 * 24]); }
        lay = ctx.circles();
        if (!lay) { foot.textContent = 'Loading the circles…'; return; }
        const S = inSel(), list = Object.keys(lay.p).filter((f) => ctx.size(f) > 0);
        cur = new Map(list.map((f) => [f, { x: lay.p[f][0], y: lay.p[f][1], r: Math.sqrt(lay.r * ctx.size(f)) }]));
        const k = (d3.zoomTransform(svg.node()).k || k0) / k0;
        const c = gC.selectAll('circle').data(list, (f) => f);
        (animate && DUR ? c.exit().transition().duration(DUR).attr('r', 0).remove() : c.exit().remove());
        const ce = c.enter().append('circle').attr('cx', (f) => cur.get(f).x).attr('cy', (f) => cur.get(f).y).attr('r', 0)
          .attr('fill', (f) => ctx.fill(f)).style('pointer-events', 'none');
        const all = ce.merge(c).attr('stroke', 'rgba(35,48,107,.45)').attr('stroke-width', 0.35 / k)
          .attr('opacity', (f) => (S && !S.has(f) ? DIM : 1));
        (animate && DUR ? all.transition().duration(DUR) : all).attr('cx', (f) => cur.get(f).x).attr('cy', (f) => cur.get(f).y).attr('r', (f) => cur.get(f).r).attr('fill', (f) => ctx.fill(f));
        // Small circles on top, so a big county never hides its neighbours.
        all.sort((a, b) => cur.get(b).r - cur.get(a).r);
        // Reference circle, at the map's current scale.
        const unit = ctx.sizeUnit(), ref = unit.ref, rr = Math.sqrt(lay.r * ref) * (d3.zoomTransform(svg.node()).k || k0);
        head.querySelector('.v2d-ref').innerHTML = `<svg width="${Math.ceil(rr * 2 + 4)}" height="${Math.ceil(rr * 2 + 4)}" style="vertical-align:middle"><circle cx="${rr + 2}" cy="${rr + 2}" r="${rr}" fill="none" stroke="${INK}" stroke-width="1.2"/></svg> ${unit.label}`;
        foot.textContent = window.matchMedia('(pointer: coarse)').matches ? 'Tap a circle to select it; long-press adds. Pinch to zoom; drag to pan.'
          : 'Drag a box to select; shift adds. Scroll or pinch to zoom; Alt-drag to pan.';
      }
      return { build, draw, reset, zoomTo };
    })();

    const VIEWS = { dots, arrows, scatter, circles };
    let current = null;
    function state0() { return ctx.key(); }
    return {
      show(name) {
        root.hidden = !name;
        if (!name) { current = null; ctx.viewNote(''); return; }
        if (current !== name) { current = name; root.dataset.view = name; foot.textContent = ''; ctx.viewNote(''); VIEWS[name].build(); VIEWS[name].draw(false); }
      },
      redraw(animate = true) { if (current) VIEWS[current].draw(animate); },
      frame(counties) {                          // zoom the arrows or circles to a set of counties (others: no camera)
        if (current === 'circles') { if (counties && counties.length) circles.zoomTo(counties); else circles.reset(); return; }
        if (current !== 'arrows') return;
        if (!counties || !counties.length) { arrows.reset(); return; }
        const sts = [...new Set(counties.map((f) => meta[f] && meta[f].st))];
        if (sts.length === 1) arrows.zoomTo(sts[0]); else arrows.reset();
      },
      countyName, centroid, bboxOf,
    };
  }
  window.VT2D = { create };
})();
