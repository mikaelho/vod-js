// Playfield "Rocks" (classic): 10 drifting rocks, buoy 1 in the middle, the other buoys on random free cells. VOD.playfield(id, def) - see src/README.md.
(function () {
var K = VOD.K, S = K.S, W = K.W, H = K.H, NB = K.NB, STEP = K.STEP, rnd = VOD.u.rnd, pick = VOD.u.pick, hull = VOD.u.hull, NR = 10;

VOD.playfield('classic', {
  label: 'Rocks', order: 10,
  host: {
    build: function (h, names) { // create obstacles and buoys, then place the ships (h.cornerStarts / freeCells / addBuoy / placeShips are in core/host.js)
      var V = h.V, bu1 = [W / 2, H / 2], corner = pick([[0,0],[W,0],[0,H],[W,H]]), starts = h.cornerStarts(corner, bu1, names.length), cells = h.freeCells(starts), i;
      h.pfs.rocks = [];
      for (i = 0; i < NR; i++) { // rocks: 8 random vertices, so the convex hull stays within Box2D's 8 vertex limit
        var p = pick(cells), size = rnd(50, 80), pts = [];
        for (var a = 0; a < 8; a++) { var l = rnd(size * .375, size * .5), an = a * Math.PI / 4; pts.push([Math.cos(an) * l, Math.sin(an) * l]); }
        var r = { kind: 'rock' }; r.pts = hull(pts);
        r.body = h.body(r, p[0], p[1], r.pts, 0);
        r.body.SetLinearVelocity(new V(rnd(0, 25) / S, rnd(0, 25) / S)); r.body.SetAngularVelocity(rnd(0, 90) * Math.PI / 180);
        h.pfs.rocks.push(r); h.loose.push(r);
      }
      h.addBuoy(1, bu1[0], bu1[1]);
      for (i = 2; i <= NB; i++) { var q = pick(cells); h.addBuoy(i, q[0], q[1]); }
      h.placeShips(names, starts, bu1);
    },
    tick: function (h) { // keep rocks on the track
      var V = h.V;
      h.pfs.rocks.forEach(function (r) {
        var p = r.body.GetPosition(), dx = W / 2 - p.x * S, dy = H / 2 - p.y * S, d = Math.hypot(dx, dy);
        if (d > Math.min(W, H) / 2) { var m = r.body.GetMass(); r.body.ApplyImpulse(new V(dx / d * 5 / (S * STEP) * m, dy / d * 5 / (S * STEP) * m), r.body.GetWorldCenter()); }
      });
    },
    init: function (h) { return { rocks: h.pfs.rocks.map(function (r) { return r.pts; }) }; },
    snapshot: function (h) { return { rocks: h.pfs.rocks.map(function (r) { var p = r.body.GetPosition(), r1 = function (v) { return Math.round(v * 10) / 10; }; return [r1(p.x * S), r1(p.y * S), r.body.GetAngle()]; }) }; }
  },
  client: { // runs in every player's browser; uses the page globals ctx, sc, circle, smooth, poly (src/client/render.js)
    interp: function (a, b, L, ang) { return { rocks: a.rocks.map(function (r, i) { return [L(r[0], b.rocks[i][0]), L(r[1], b.rocks[i][1]), ang(r[2], b.rocks[i][2])]; }) }; },
    draw: function (G, I) { // background layer: below buoys and ships
  G.pf.rocks.forEach((pts, i) => { const r = I.pf.rocks[i]; ctx.save(); ctx.translate(r[0], r[1]); ctx.rotate(r[2]); smooth(pts);
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.shadowColor = 'darkgrey'; ctx.shadowBlur = 20; ctx.fill(); ctx.stroke(); ctx.restore(); });
    }
  }
});
})();
