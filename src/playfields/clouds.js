// Playfield "Clouds": drifting, overlapping circular clouds cover about half of the field. A ship inside a cloud when a thrust fires (every 3 s) first loses 50% of its velocity, and the thrust itself is cut by 50% too.
// Overlaps do not stack. Cloud positions are a pure function of the host's clock (straight drift, bouncing off the edges of the field), so the client can predict them for the route preview.
(function () {
var K = VOD.K, W = K.W, H = K.H, NB = K.NB, rnd = VOD.u.rnd, pick = VOD.u.pick, KEEP = .5, SLOW = { v: KEEP, t: KEEP }, ONE = { v: 1, t: 1 }, COVER = .5, RMIN = 120, RMAX = 260;
var bounce = function (v, L) { var m = (v % (2 * L) + 2 * L) % (2 * L); return m <= L ? m : 2 * L - m; }; // a straight run that reflects off 0 and L
var at = function (c, t) { return [bounce(c.x + c.vx * t, W), bounce(c.y + c.vy * t, H)]; }; // where cloud c (its centre) is at host time t: it bounces off the edges of the field
var inside = function (clouds, x, y, t) { return clouds.some(function (c) { var p = at(c, t); return Math.hypot(p[0] - x, p[1] - y) < c.r; }); };
// Clouds are added until the average cover over the first
// 10 minutes reaches 50%, and a layout is only accepted if the cover stays between 40% and 65% in that time (the best of 80 tries otherwise).
var GRID = 60, GX = Math.floor(W / GRID), GY = Math.floor(H / GRID), TS = [], i0;
for (i0 = 0; i0 <= 600; i0 += 30) TS.push(i0);
var makeClouds = function () {
  var best = null;
  for (var attempt = 0; attempt < 80; attempt++) {
    var clouds = [], seen = TS.map(function () { return new Uint8Array(GX * GY); }), count = TS.map(function () { return 0; }), mean = 0, mn = 0, mx = 0;
    while (clouds.length < 60 && mean < COVER) {
      var an = rnd(0, 2 * Math.PI), sp = rnd(12, 28), c = { x: rnd(0, W), y: rnd(0, H), vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, r: rnd(RMIN, RMAX) }; clouds.push(c);
      TS.forEach(function (t, k) { // mark the sample points this cloud covers at time t
        var p = at(c, t);
        for (var gx = Math.max(0, Math.floor((p[0] - c.r) / GRID)); gx <= Math.min(GX - 1, Math.floor((p[0] + c.r) / GRID)); gx++) for (var gy = Math.max(0, Math.floor((p[1] - c.r) / GRID)); gy <= Math.min(GY - 1, Math.floor((p[1] + c.r) / GRID)); gy++) {
          var idx = gx * GY + gy; if (!seen[k][idx] && Math.hypot(p[0] - (gx + .5) * GRID, p[1] - (gy + .5) * GRID) < c.r) { seen[k][idx] = 1; count[k]++; }
        }
      });
      var fr = count.map(function (n) { return n / (GX * GY); }); mean = fr.reduce(function (a, b) { return a + b; }, 0) / fr.length; mn = Math.min.apply(null, fr); mx = Math.max.apply(null, fr);
    }
    var bad = Math.max(0, .4 - mn) + Math.max(0, mx - .65); if (!best || bad < best.bad) best = { clouds: clouds, bad: bad };
    if (bad === 0) break;
  }
  return best.clouds;
};

VOD.playfield('clouds', {
  label: 'Clouds', order: 28,
  host: {
    build: function (h, names) {
      var bu1 = [W / 2, H / 2], corner = pick([[0,0],[W,0],[0,H],[W,H]]), starts = h.cornerStarts(corner, bu1, names.length), cells = h.freeCells(starts), clouds = makeClouds(), i;
      h.pfs.clouds = clouds;
      h.addBuoy(1, bu1[0], bu1[1]); for (i = 2; i <= NB; i++) { var q = pick(cells); h.addBuoy(i, q[0], q[1]); }
      h.placeShips(names, starts, bu1);
    },
    drag: function (h, sh) { var p = sh.body.GetPosition(); return inside(h.pfs.clouds, p.x * K.S, p.y * K.S, h.time) ? SLOW : ONE; }, // velocity and thrust factors applied just before each thrust fires
    init: function (h) { return { clouds: h.pfs.clouds }; }
  },
  client: {
    damp: function (G, x, y, T) { return inside(G.pf.clouds, x, y, T) ? SLOW : ONE; }, // the same factor, for the route preview
    draw: function (G, I) {
      G.pf.clouds.forEach(c => {
        const p = at(c, I.th), x = p[0], y = p[1], g = ctx.createRadialGradient(x, y, 0, x, y, c.r);
        g.addColorStop(0, 'rgba(160,185,225,.26)'); g.addColorStop(.8, 'rgba(160,185,225,.26)'); g.addColorStop(1, 'rgba(160,185,225,0)');
        ctx.fillStyle = g; circle(x, y, c.r); ctx.fill();
      });
    }
  }
});
})();
