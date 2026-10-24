// Weapon "Mine": the Fire button drops a mine behind the ship, where it stays (gravity still pulls it). After a short arming time it explodes when any ship, the
// owner's too, comes within its trigger distance; the pilot can also detonate it at any time (the button becomes Detonate). One per pilot in play; the cooldown
// starts when it is gone. The explosion is a heavy collision for every ship in reach (h.blast).
(function () {
var K = VOD.K, S = K.S, MINE = { arm: 1.5, trigger: 55, life: 90, radius: 9, drop: 75 }, BLAST = { r: 120, dmg: 60, push: 2 };
var mine = function (h, i) { return h.projectiles.filter(function (m) { return m.kind === 'mine' && m.owner === i; }); };

VOD.weapon('mine', {
  label: 'Mine', order: 30,
  targeted: false, // no target: Fire just drops it
  host: {
    fire: function (h, sh) {
      if (mine(h, sh.i).length) return h.nofire(sh, 'a mine is already in play');
      var p = sh.body.GetPosition(), v = sh.body.GetLinearVelocity(), sp = Math.hypot(v.x, v.y) * S, ang = sp > 5 ? Math.atan2(v.y, v.x) : sh.body.GetAngle();
      var m = { kind: 'mine', projectile: true, owner: sh.i, born: h.time, exploding: false }; // a sensor: ships fly through it, it only watches them
      m.body = h.body(m, p.x * S - Math.cos(ang) * MINE.drop, p.y * S - Math.sin(ang) * MINE.drop, null, MINE.radius); m.body.SetLinearVelocity(new h.V(0, 0));
      h.projectiles.push(m); h.events.push({ e: 'drop', i: sh.i }); return true;
    },
    detonate: function (h, i) { var ms = mine(h, i); ms.forEach(function (m) { m.exploding = true; }); return ms.length > 0; },
    before: function (h) { // every step: look for ships in reach of an armed mine, and for old mines
      h.projectiles.forEach(function (m) {
        if (m.kind !== 'mine') return;
        if (h.time - m.born > MINE.life) m.exploding = true;
        if (m.exploding || h.time - m.born < MINE.arm) return;
        var p = m.body.GetPosition();
        h.ships.forEach(function (s) { if (!s.dead && Math.hypot(s.body.GetPosition().x - p.x, s.body.GetPosition().y - p.y) * S < MINE.trigger) m.exploding = true; });
      });
    },
    after: function (h) {
      for (var i = h.projectiles.length - 1; i >= 0; i--) {
        var m = h.projectiles[i]; if (m.kind !== 'mine' || !m.exploding) continue;
        var p = m.body.GetPosition(); h.blast(p.x * S, p.y * S, BLAST); h.world.DestroyBody(m.body); h.projectiles.splice(i, 1);
        var ow = h.ships[m.owner]; if (ow) ow.readyAt = h.time + K.WEAPON_CD;
      }
    },
    init: function () { return { arm: MINE.arm, trigger: MINE.trigger }; },
    snapshot: function (h) { // [x, y, owner, armed 0/1]
      var r1 = function (v) { return Math.round(v * 10) / 10; };
      return { mines: h.projectiles.filter(function (m) { return m.kind === 'mine'; }).map(function (m) { var p = m.body.GetPosition(); return [r1(p.x * S), r1(p.y * S), m.owner, h.time - m.born >= MINE.arm ? 1 : 0]; }) };
    }
  },
  client: {
    sound: function (e, v, T) { if (e.e === 'drop') { T.tone(500, 380, .12, 'triangle', .3 * v); T.tone(1000, 1000, .12, 'sine', .3 * v, .12); } },
    verb: 'Drop', // the button reads "Drop Mine"
    canDetonate: function (s, me) { return (s.w.mines || []).some(function (m) { return m[2] === me; }); },
    interp: function (a, b, L) { return { mines: (a.mines || []).map(function (m) { const n = (b.mines || []).find(o => o[2] === m[2]); return n ? [L(m[0], n[0]), L(m[1], n[1]), m[2], n[3]] : m; }) }; },
    draw: function (G, I, now) {
      I.w.mines.forEach(m => {
        const col = G.players[m[2]].color, pulse = m[3] ? .5 + .5 * Math.sin(now / 120) : .25 + .25 * Math.sin(now / 400);
        ctx.save(); ctx.translate(m[0], m[1]); ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.fillStyle = '#000'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.lineTo(Math.cos(a) * 15, Math.sin(a) * 15); ctx.stroke(); }
        circle(0, 0, 9); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0; ctx.fillStyle = col; ctx.globalAlpha = pulse; circle(0, 0, 4); ctx.fill(); ctx.restore();
        if (m[3] && G.w && G.w.trigger) { ctx.save(); ctx.globalAlpha = .18; ctx.strokeStyle = col; ctx.setLineDash([6 / sc, 8 / sc]); ctx.lineWidth = Math.max(1.5, 1.5 / sc); circle(m[0], m[1], G.w.trigger); ctx.stroke(); ctx.restore(); } // its trigger distance
      });
    },
    fx: function (f, now) { // the explosion: a flash and a ring that grows to the blast radius
      if (f.e !== 'blast') return;
      const t = (now - f.at) / 700; if (t >= 1) return;
      ctx.save(); ctx.globalAlpha = 1 - t; ctx.fillStyle = '#fff'; if (t < .2) { circle(f.x, f.y, f.r * .5 * (1 - t / .2) + 12); ctx.fill(); }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(3, 3 / sc); circle(f.x, f.y, f.r * Math.min(1, t * 2.5)); ctx.stroke(); ctx.restore();
    }
  }
});
})();
