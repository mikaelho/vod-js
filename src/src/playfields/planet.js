// Playfield "Planet": a planet in the middle with three moons on orbits; gravity (k / distance^2) bends every trajectory. Buoys lie on alternate sides of the planet.
(function () {
var K = VOD.K, S = K.S, W = K.W, H = K.H, NB = K.NB, FIX = K.FIX, pick = VOD.u.pick;
var PLANET = { rad: 90, k: 600000, mass: 8, soft: 8 }; // gravity = k / distance^2: about 10 px/s^2 at 250 px, i.e. a step's drift moves ~45 px
var MOON_K = PLANET.k / 9; // a moon pulls 1/9 as hard as the planet, so the two cancel 3/4 of the way from the planet to the moon (0.75^2 : 0.25^2 = 9 : 1)
var MOONS = [{ r: 250, rad: 26, k: MOON_K, w: .15, mass: 4 }, { r: 380, rad: 20, k: MOON_K, w: -.1, mass: 3 }, { r: 520, rad: 32, k: MOON_K, w: .07, mass: 5 }];
var orbit = function (h, m, t) { var a = m.a0 + m.w * t, c = h.pfs.grav.c; return [c[0] + m.r * Math.cos(a), c[1] + m.r * Math.sin(a)]; };

VOD.playfield('planet', {
  label: 'Planet', order: 20,
  host: {
    build: function (h, names) {
      var ctr = [W / 2, H / 2], corner = pick([[0,0],[W,0],[0,H],[W,H]]), n = names.length, i;
      var grav = h.pfs.grav = { c: ctr, soft: PLANET.soft, planet: { rad: PLANET.rad, k: PLANET.k }, moons: [] }; h.pfs.moons = [];
      var planet = { kind: 'planet', mass: PLANET.mass }; planet.body = h.body(planet, ctr[0], ctr[1], null, PLANET.rad, 'static');
      MOONS.forEach(function (m) {
        var o = { kind: 'moon', mass: m.mass, r: m.r, w: m.w, a0: Math.random() * 2 * Math.PI }, p = orbit(h, o, 0);
        o.body = h.body(o, p[0], p[1], null, m.rad, 'kinematic'); h.pfs.moons.push(o); grav.moons.push({ r: m.r, w: m.w, a0: o.a0, rad: m.rad, k: m.k });
      });
      // buoy 1 sits a quarter turn around the planet from the start corner, so the straight line from the start misses the planet
      var dd = [corner[0] - ctr[0], corner[1] - ctr[1]], ll = Math.hypot(dd[0], dd[1]), sg = Math.random() < .5 ? 1 : -1, bu1 = [ctr[0] - sg * dd[1] / ll * 520, ctr[1] + sg * dd[0] / ll * 520];
      var starts = h.cornerStarts(corner, bu1, n), cells = h.freeCells(starts, function (x, y) { return Math.hypot(x - ctr[0], y - ctr[1]) > PLANET.rad + 150 && Math.hypot(x - bu1[0], y - bu1[1]) > 100; });
      var bpos = [bu1]; // each next buoy lies somewhere in the half-plane on the far side of the planet from the previous one (90 to 270 degrees round it)
      for (var bi = 1; bi < NB; bi++) {
        var pv = bpos[bi - 1], pa = Math.atan2(pv[1] - ctr[1], pv[0] - ctr[0]), cand = null;
        for (var tries = 0; tries < 400 && !cand; tries++) {
          var an = pa + Math.PI / 2 + Math.random() * Math.PI, rr = 250 + Math.random() * 350, c = [ctr[0] + rr * Math.cos(an), ctr[1] + rr * Math.sin(an)];
          if (c[0] > 60 && c[0] < W - 60 && c[1] > 60 && c[1] < H - 60 && bpos.every(function (b) { return Math.hypot(b[0] - c[0], b[1] - c[1]) > 150; }) && starts.every(function (st) { return Math.hypot(st[0] - c[0], st[1] - c[1]) > 150; })) cand = c;
        }
        bpos.push(cand || pick(cells));
      }
      bpos.forEach(function (q, j) { h.addBuoy(j + 1, q[0], q[1]); });
      h.placeShips(names, starts, bu1);
    },
    before: function (h) { // each physics step: move the moons along their orbits, then pull ships and projectiles towards the planet and moons
      var V = h.V, src = [[h.pfs.grav.c[0], h.pfs.grav.c[1], PLANET.k]];
      h.pfs.moons.forEach(function (m, i) {
        var p = orbit(h, m, h.time + FIX), c = m.body.GetPosition();
        m.body.SetLinearVelocity(new V((p[0] / S - c.x) / FIX, (p[1] / S - c.y) / FIX)); src.push([c.x * S, c.y * S, MOONS[i].k]);
      });
      var pull = function (body) {
        var p = body.GetPosition(), x = p.x * S, y = p.y * S, ax = 0, ay = 0, m = body.GetMass();
        src.forEach(function (g) { var dx = g[0] - x, dy = g[1] - y, d2 = dx * dx + dy * dy + PLANET.soft * PLANET.soft, f = g[2] / (d2 * Math.sqrt(d2)); ax += dx * f; ay += dy * f; });
        body.ApplyForce(new V(m * ax / S, m * ay / S), body.GetWorldCenter());
      };
      h.ships.forEach(function (sh) { if (!sh.dead) pull(sh.body); });
      h.projectiles.forEach(function (pr) { pull(pr.body); });
    },
    init: function (h) { return { grav: h.pfs.grav }; },
    snapshot: function (h) { var r1 = function (v) { return Math.round(v * 10) / 10; }; return { moons: h.pfs.moons.map(function (m) { var p = m.body.GetPosition(); return [r1(p.x * S), r1(p.y * S)]; }) }; }
  },
  client: {
    accel: function (G, x, y, T) { // gravity (px/s^2) at host time T, same formula as the host uses
      const g = G.pf.grav; let ax = 0, ay = 0;
      const add = (bx, by, k) => { const dx = bx - x, dy = by - y, d2 = dx * dx + dy * dy + g.soft * g.soft, f = k / (d2 * Math.sqrt(d2)); ax += dx * f; ay += dy * f; };
      add(g.c[0], g.c[1], g.planet.k); g.moons.forEach(m => { const a = m.a0 + m.w * T; add(g.c[0] + m.r * Math.cos(a), g.c[1] + m.r * Math.sin(a), m.k); });
      return [ax, ay];
    },
    interp: function (a, b, L) { return { moons: a.moons.map(function (r, i) { return [L(r[0], b.moons[i][0]), L(r[1], b.moons[i][1])]; }) }; },
    draw: function (G, I) {
  if (G.pf.grav) { const g = G.pf.grav; ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 1.5 / sc; ctx.setLineDash([6 / sc, 10 / sc]); // orbits, planet, moons
    g.moons.forEach(m => { circle(g.c[0], g.c[1], m.r); ctx.stroke(); }); ctx.setLineDash([]);
    const gr = ctx.createRadialGradient(g.c[0] - 25, g.c[1] - 25, 10, g.c[0], g.c[1], g.planet.rad); gr.addColorStop(0, '#6f8fbf'); gr.addColorStop(1, '#0d1a33');
    ctx.shadowColor = '#7aa6ff'; ctx.shadowBlur = 40; circle(g.c[0], g.c[1], g.planet.rad); ctx.fillStyle = gr; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(160,190,255,.6)'; ctx.lineWidth = 2; ctx.stroke();
    I.pf.moons.forEach((m, i) => { circle(m[0], m[1], g.moons[i].rad); ctx.fillStyle = '#556'; ctx.shadowColor = '#aab'; ctx.shadowBlur = 15; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#ccd'; ctx.lineWidth = 2; ctx.stroke();
      const ex = g.c[0] + .75 * (m[0] - g.c[0]), ey = g.c[1] + .75 * (m[1] - g.c[1]); ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = Math.max(1.5, 1.5 / sc); // pull of planet and moon cancels here
      circle(ex, ey, 9); ctx.stroke(); circle(ex, ey, 2.5); ctx.fill(); ctx.restore(); }); ctx.restore(); }
    }
  }
});
})();
