/* County swing arrow map: shared drawing code for the page and the article image.
   Needs d3 (v7.9.0) and topojson-client (v3.1.0) loaded first.
   Draws in d3.geoAlbersUsa's 975 x 610 space; the caller sets the SVG viewBox. */
(function (global) {
  'use strict';

  var C = Math.SQRT1_2; // cos 45 = sin 45

  // One arrow from (x, y): leans right (toward the Democrat) for s > 0, left for s < 0,
  // tilted up 45 degrees, length k * |s|. Returns an SVG path string: shaft plus two head strokes.
  function arrowPath(x, y, s, o) {
    var L = Math.abs(s) * o.k;
    var dir = s >= 0 ? 1 : -1;
    var ux = dir * C, uy = -C;
    var x1 = x + ux * L, y1 = y + uy * L;
    var h = Math.min(o.headMax, L * o.headFrac);
    var a = o.headAngle;
    var ca = Math.cos(a), sa = Math.sin(a);
    // rotate the reversed direction by +/- a to get the wing points
    var bx = -ux, by = -uy;
    var w1x = x1 + h * (bx * ca - by * sa), w1y = y1 + h * (bx * sa + by * ca);
    var w2x = x1 + h * (bx * ca + by * sa), w2y = y1 + h * (-bx * sa + by * ca);
    var f = function (v) { return Math.round(v * 100) / 100; };
    return 'M' + f(x) + ',' + f(y) + 'L' + f(x1) + ',' + f(y1) +
      'M' + f(w1x) + ',' + f(w1y) + 'L' + f(x1) + ',' + f(y1) + 'L' + f(w2x) + ',' + f(w2y);
  }

  var DEFAULTS = {
    k: 0.42,            // map units per point of swing
    headMax: 2.6,
    headFrac: 0.42,
    headAngle: 0.5,     // radians, about 29 degrees
    demStroke: 0.6,
    demOpacity: 0.72,
    repStroke: 0.9,
    repFillOpacity: 0.2,
    countyStroke: 0.25,
    countyOpacity: 0.45,
    stateStroke: 0.55,
    colors: { ground: '#E8ECEC', dem: '#23306B', rep: '#A8231C', graphite: '#5B6168' }
  };

  // svg: a d3 selection of an <svg>. topo: us-atlas counties-10m. rows: [{f, s, n, st}].
  function draw(svg, topo, rows, opts) {
    var o = Object.assign({}, DEFAULTS, opts || {});
    o.colors = Object.assign({}, DEFAULTS.colors, (opts || {}).colors || {});
    var projection = d3.geoAlbersUsa().scale(1300).translate([487.5, 305]);
    var path = d3.geoPath(projection);

    var counties = topojson.feature(topo, topo.objects.counties).features;
    var states = topojson.feature(topo, topo.objects.states).features;
    var stateName = {};
    states.forEach(function (s) { stateName[s.id] = s.properties.name; });
    var byFips = new Map(rows.map(function (r) { return [r.f, r]; }));

    var gCounties = svg.append('g').attr('class', 'am-counties');
    var countyPaths = gCounties.selectAll('path')
      .data(counties)
      .join('path')
      .attr('d', path)
      .attr('fill', function (d) {
        var r = byFips.get(d.id);
        return r && r.s < 0 ? o.colors.rep : 'none';
      })
      .attr('fill-opacity', function (d) {
        var r = byFips.get(d.id);
        return r && r.s < 0 ? o.repFillOpacity : 0;
      })
      .attr('stroke', o.colors.graphite)
      .attr('stroke-opacity', o.countyOpacity)
      .attr('stroke-width', o.countyStroke)
      .attr('stroke-linejoin', 'round');

    svg.append('path')
      .attr('class', 'am-states')
      .datum(topojson.mesh(topo, topo.objects.states, function (a, b) { return a !== b; }))
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', o.colors.graphite)
      .attr('stroke-width', o.stateStroke)
      .attr('stroke-linejoin', 'round');
    svg.append('path')
      .attr('class', 'am-nation')
      .datum(topojson.mesh(topo, topo.objects.nation))
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', o.colors.graphite)
      .attr('stroke-width', o.stateStroke * 1.2)
      .attr('stroke-linejoin', 'round');

    // Centroids for every county with data; red counties also get an outline in red.
    var centroid = new Map();
    counties.forEach(function (d) {
      if (byFips.has(d.id)) {
        var c = path.centroid(d);
        if (isFinite(c[0])) centroid.set(d.id, c);
      }
    });

    var demD = [], repD = [];
    rows.forEach(function (r) {
      var c = centroid.get(r.f);
      if (!c) return;
      (r.s >= 0 ? demD : repD).push(arrowPath(c[0], c[1], r.s, o));
    });
    svg.append('path').attr('class', 'am-arrows-dem')
      .attr('d', demD.join(''))
      .attr('fill', 'none')
      .attr('stroke', o.colors.dem)
      .attr('stroke-opacity', o.demOpacity)
      .attr('stroke-width', o.demStroke)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round');
    svg.append('path').attr('class', 'am-arrows-rep')
      .attr('d', repD.join(''))
      .attr('fill', 'none')
      .attr('stroke', o.colors.rep)
      .attr('stroke-width', o.repStroke)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round');

    return {
      projection: projection, path: path, counties: counties, countyPaths: countyPaths,
      byFips: byFips, centroid: centroid, stateName: stateName, opts: o,
      arrowPath: function (x, y, s, extra) { return arrowPath(x, y, s, Object.assign({}, o, extra || {})); }
    };
  }

  global.ArrowMap = { draw: draw, arrowPath: arrowPath, DEFAULTS: DEFAULTS };
})(typeof window !== 'undefined' ? window : this);
