// Playfield "Shells": thin concentric rings with gaps, each turning about its own (slightly misaligned) centre, alternately clockwise and counter-clockwise (slowly: 0.06 to 0.16 rad/s).
// Three rings. Buoy 3 is in the middle; buoys 1 and 5 lie in the outer lane (between the two outer rings), 2 and 4 in the inner lane, each on the far side from the previous one (like Planet).
(function () {
var K = VOD.K, S = K.S, W = K.W, H = K.H, NB = K.NB, rnd = VOD.u.rnd, pick = VOD.u.pick;
var RADII = [140, 270, 400], THICK = 14, GAP = 135, CHUNK = 12 * Math.PI / 180, WALL_MASS = 2; // ring radii, wall thickness and gap width in px; solid arcs are cut into 12 degree pieces for Box2D

function ringArcs(r) { // the solid stretches of a ring (angles in radians from its own zero), leaving 1 or 2 gaps of GAP px
  var gaps = r < 150 ? 1 : 2, ga = GAP / r, a0 = Math.random() * 2 * Math.PI, seg = 2 * Math.PI / gaps, out = [];
  for (var g = 0; g < gaps; g++) { var s = a0 + g * seg + ga + rnd(0, .35 * (seg - 2 * ga)), e = a0 + (g + 1) * seg + rnd(-.35, 0) * (seg - 2 * ga); out.push([s, e]); }
  return out; // [start, end] pairs; the gap lies between one end and the next start
}

VOD.playfield('shells', {
  label: 'Shells', order: 25,
  host: {
    build: function (h, names) {
      var b2 = h.b2, V = h.V, ctr = [W / 2, H / 2], corner = pick([[0,0],[W,0],[0,H],[W,H]]), n = names.length, i;
      h.pfs.rings = [];
      RADII.forEach(function (r, ri) {
        var off = [rnd(-10, 10), rnd(-10, 10)], c = [ctr[0] + off[0], ctr[1] + off[1]], w = (ri % 2 ? -1 : 1) * rnd(.06, .16), arcs = ringArcs(r), ring = { kind: 'ring', mass: WALL_MASS };
        var bd = new b2.Dynamics.b2BodyDef(); bd.type = b2.Dynamics.b2Body.b2_kinematicBody; bd.position.Set(c[0] / S, c[1] / S); bd.userData = ring; ring.body = h.world.CreateBody(bd);
        arcs.forEach(function (ar) {
          var pieces = Math.max(1, Math.ceil((ar[1] - ar[0]) / CHUNK));
          for (var k = 0; k < pieces; k++) {
            var s = ar[0] + (ar[1] - ar[0]) * k / pieces, e = ar[0] + (ar[1] - ar[0]) * (k + 1) / pieces, ro = r + THICK / 2, rin = r - THICK / 2;
            var fd = new b2.Dynamics.b2FixtureDef(); fd.shape = new b2.Collision.Shapes.b2PolygonShape(); fd.friction = .2; fd.restitution = .5;
            fd.shape.SetAsArray([[rin, s], [ro, s], [ro, e], [rin, e]].map(function (q) { return new V(q[0] * Math.cos(q[1]) / S, q[0] * Math.sin(q[1]) / S); }), 4);
            ring.body.CreateFixture(fd);
          }
        });
        ring.body.SetAngularVelocity(w); ring.def = { c: c, r: r, th: THICK, arcs: arcs }; h.pfs.rings.push(ring);
      });
      // buoy 1 in the outer lane, towards the start corner: the ships approach it head-on, with plenty of room before the first ring
      var lane = [(RADII[0] + RADII[1]) / 2, (RADII[1] + RADII[2]) / 2], ca = Math.atan2(corner[1] - ctr[1], corner[0] - ctr[0]) + rnd(-.4, .4);
      var bu1 = [ctr[0] + lane[1] * Math.cos(ca), ctr[1] + lane[1] * Math.sin(ca)], starts = h.cornerStarts(corner, bu1, n), bpos = [bu1];
      var place = function (prev, r) { // in the lane of radius r, on the far side of the previous buoy (anywhere when the previous one is the centre)
        var pa = prev ? Math.atan2(prev[1] - ctr[1], prev[0] - ctr[0]) : 0, best = null;
        for (var tries = 0; tries < 300; tries++) {
          var an = prev ? pa + Math.PI / 2 + Math.random() * Math.PI : Math.random() * 2 * Math.PI, c = [ctr[0] + r * Math.cos(an), ctr[1] + r * Math.sin(an)];
          best = c; if (bpos.every(function (b) { return Math.hypot(b[0] - c[0], b[1] - c[1]) > 150; })) break;
        }
        return best;
      };
      bpos.push(place(bu1, lane[0])); bpos.push(ctr.slice()); bpos.push(place(null, lane[0])); bpos.push(place(bpos[3], lane[1])); // buoys 1 (outer lane), 2 (inner), 3 (centre), 4 (inner), 5 (outer)
      bpos.forEach(function (q, j) { h.addBuoy(j + 1, q[0], q[1]); });
      h.placeShips(names, starts, bu1);
    },
    init: function (h) { return { rings: h.pfs.rings.map(function (r) { return r.def; }) }; },
    snapshot: function (h) { return { rings: h.pfs.rings.map(function (r) { return Math.round(r.body.GetAngle() * 1000) / 1000; }) }; }
  },
  client: {
    interp: function (a, b, L, ang) { return { rings: a.rings.map(function (v, i) { return ang(v, b.rings[i]); }) }; },
    draw: function (G, I) { // each ring: a white glowing outline, then black over it, so it reads like the rocks
      G.pf.rings.forEach((rg, i) => {
        const a = I.pf.rings[i]; ctx.save(); ctx.translate(rg.c[0], rg.c[1]); ctx.lineCap = 'round';
        const arcs = () => rg.arcs.forEach(ar => { ctx.beginPath(); ctx.arc(0, 0, rg.r, ar[0] + a, ar[1] + a); ctx.stroke(); });
        ctx.strokeStyle = '#fff'; ctx.lineWidth = rg.th + 4; ctx.shadowColor = 'darkgrey'; ctx.shadowBlur = 20; arcs(); ctx.shadowBlur = 0; ctx.strokeStyle = '#000'; ctx.lineWidth = rg.th - 3; arcs(); ctx.restore();
      });
    }
  }
});
})();
