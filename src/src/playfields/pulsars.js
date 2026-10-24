// Playfield "Pulsars": three spinning pulsars. Each one, at a fixed period, sends a pulse out along its axis (as it points at that moment) in both directions, in a straight line.
// A ship the pulse front reaches inside the beam gets one kick along the direction of travel. Nothing else acts on ships: no gravity, no field, and the route preview ignores pulses.
(function () {
var K = VOD.K, S = K.S, W = K.W, H = K.H, NB = K.NB, rnd = VOD.u.rnd, pick = VOD.u.pick;
var SPEED = 420, LIFE = 1.9, BAND = 60, HALFW = 150, KICK = 50, CORE = 28; // pulse front speed (px/s), lifetime (s), thickness of the front and half width of the beam (px), velocity change (px/s) of a hit on the beam's axis, solid core radius

function pulse(p, t) { // the pulse alive at host time t, or null
  if (t < p.phase) return null;
  var k = Math.floor((t - p.phase) / p.P), te = p.phase + k * p.P, age = t - te; if (age > LIFE) return null;
  var th = p.th0 + p.w * te; return { ux: Math.cos(th), uy: Math.sin(th), d: SPEED * age, age: age, id: k };
}
function hit(p, a, x, y) { // 0 unless the front of pulse a (from pulsar p) is on the point (x, y) now; otherwise the strength 0..1 and the direction of travel
  var dx = x - p.x, dy = y - p.y, al = dx * a.ux + dy * a.uy, pe = -dx * a.uy + dy * a.ux; if (Math.abs(pe) > HALFW) return null;
  var d = Math.abs(al); if (d > a.d || d < a.d - BAND) return null;
  var s = al >= 0 ? 1 : -1; return { k: 1 - (pe / HALFW) * (pe / HALFW), ux: s * a.ux, uy: s * a.uy };
}

VOD.playfield('pulsars', {
  label: 'Pulsars', order: 35,
  host: {
    hit: hit, // exposed for tests
    build: function (h, names) {
      var ctr = [W / 2, H / 2], bu1 = ctr.slice(), corner = pick([[0,0],[W,0],[0,H],[W,H]]), a0 = Math.random() * 2 * Math.PI, periods = [4, 5, 6], i;
      h.pfs.pulsars = periods.map(function (P, k) { var an = a0 + k * 2 * Math.PI / 3 + rnd(-.2, .2), r = 430 + rnd(-40, 40);
        return { x: Math.round(ctr[0] + r * Math.cos(an)), y: Math.round(ctr[1] + r * Math.sin(an)), P: P, phase: Math.round(rnd(0, P) * 10) / 10 + 3, th0: rnd(0, 2 * Math.PI), w: (k % 2 ? -1 : 1) * rnd(.35, .6), seen: -1 }; });
      h.pfs.pulsars.forEach(function (p) { var core = { kind: 'pulsar', mass: 8 }; core.body = h.body(core, p.x, p.y, null, CORE, 'static'); }); // a solid core: hitting it hurts
      var starts = h.cornerStarts(corner, bu1, names.length), cells = h.freeCells(starts, function (x, y) { return h.pfs.pulsars.every(function (p) { return Math.hypot(p.x - x, p.y - y) > 140; }); });
      h.addBuoy(1, bu1[0], bu1[1]); for (i = 2; i <= NB; i++) { var q = pick(cells); h.addBuoy(i, q[0], q[1]); }
      h.placeShips(names, starts, bu1);
    },
    before: function (h) { // every step: announce each new pulse, and kick each ship the front reaches (once per pulse and ship)
      var V = h.V, ps = h.pfs.pulsars, t = h.time;
      ps.forEach(function (p, pi) {
        if (t < p.phase) return;
        var k = Math.floor((t - p.phase) / p.P); if (k !== p.seen) { p.seen = k; h.events.push({ e: 'pulse', x: p.x, y: p.y }); }
        var a = pulse(p, t); if (!a) return;
        h.ships.forEach(function (sh) {
          if (sh.dead || sh['pu' + pi] === k) return;
          var q = sh.body.GetPosition(), r = hit(p, a, q.x * S, q.y * S); if (!r) return;
          sh['pu' + pi] = k; var m = sh.body.GetMass() * KICK * r.k / S; sh.body.ApplyImpulse(new V(r.ux * m, r.uy * m), sh.body.GetWorldCenter());
          h.events.push({ e: 'pulsehit', i: sh.i, x: Math.round(q.x * S), y: Math.round(q.y * S) });
        });
      });
    },
    init: function (h) { return { pulsars: h.pfs.pulsars.map(function (p) { return { x: p.x, y: p.y, P: p.P, phase: p.phase, th0: p.th0, w: p.w }; }) }; }
  },
  client: {
    sound: function (e, v, T) { if (e.e === 'pulse') { T.noise(.8, 'bandpass', 200, 700, .9 * v, 0, .25); T.tone(90, 130, .7, 'sawtooth', .1 * v, 0, .2); } else if (e.e === 'pulsehit') { T.tone(700, 650, .3, 'sine', .3 * v); T.tone(1050, 1000, .25, 'sine', .2 * v); T.noise(.2, 'bandpass', 1500, 600, .3 * v, 0, .02); } },
    fx: function (f, now) { if (f.e !== 'pulsehit') return; const t = (now - f.at) / 500; if (t >= 1) return; ctx.save(); ctx.globalAlpha = 1 - t; ctx.strokeStyle = '#bdf'; ctx.lineWidth = Math.max(3, 3 / sc); circle(f.x, f.y, 25 + 60 * t); ctx.stroke(); ctx.restore(); }, // a ring where a pulse hit a ship
    draw: function (G, I) {
      const t = I.th;
      G.pf.pulsars.forEach(p => {
        const th = p.th0 + p.w * t, ux = Math.cos(th), uy = Math.sin(th), next = t < p.phase ? p.phase : p.phase + (Math.floor((t - p.phase) / p.P) + 1) * p.P, charge = 1 - Math.max(0, Math.min(1, (next - t) / p.P));
        const a = pulse(p, t); // the pulse front, drawn as two glowing bars moving apart in a straight line along the axis the pulsar had when it fired
        if (a) for (const s of [1, -1]) { const cx = p.x + s * a.ux * a.d, cy = p.y + s * a.uy * a.d, al = 1 - a.age / LIFE;
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.atan2(a.uy, a.ux)); const g = ctx.createLinearGradient(-BAND / 2, 0, BAND / 2, 0); g.addColorStop(0, 'rgba(180,220,255,0)'); g.addColorStop(.5, 'rgba(200,230,255,' + (.55 * al) + ')'); g.addColorStop(1, 'rgba(180,220,255,0)');
          ctx.fillStyle = g; ctx.shadowColor = '#9cf'; ctx.shadowBlur = 25; ctx.fillRect(-BAND / 2, -HALFW, BAND, 2 * HALFW); ctx.restore(); }
        ctx.save(); ctx.translate(p.x, p.y); // the pulsar: rotating jets show the axis; the ring fills as the next pulse nears
        ctx.strokeStyle = 'rgba(160,210,255,' + (.12 + .35 * charge) + ')'; ctx.lineWidth = 2; ctx.setLineDash([8 / sc, 10 / sc]); ctx.beginPath(); ctx.moveTo(-ux * 140, -uy * 140); ctx.lineTo(ux * 140, uy * 140); ctx.stroke(); ctx.setLineDash([]);
        for (const s of [1, -1]) { const g = ctx.createLinearGradient(0, 0, s * ux * 90, s * uy * 90); g.addColorStop(0, 'rgba(200,230,255,' + (.5 + .5 * charge) + ')'); g.addColorStop(1, 'rgba(200,230,255,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-uy * 9, ux * 9); ctx.lineTo(s * ux * 90, s * uy * 90); ctx.lineTo(uy * 9, -ux * 9); ctx.closePath(); if (s < 0) { ctx.beginPath(); ctx.moveTo(-uy * 9, ux * 9); ctx.lineTo(-ux * 90, -uy * 90); ctx.lineTo(uy * 9, -ux * 9); ctx.closePath(); } ctx.fill(); }
        ctx.shadowColor = '#9cf'; ctx.shadowBlur = 25 + 25 * charge; ctx.fillStyle = '#000'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; circle(0, 0, CORE); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
        ctx.strokeStyle = '#9cf'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, CORE + 9, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * charge); ctx.stroke(); ctx.restore();
      });
    }
  }
});
})();
