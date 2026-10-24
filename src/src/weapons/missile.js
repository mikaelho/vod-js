// Weapon "Missile": launched along the ship's own course with a little extra speed; with a clear line to the target, it accelerates flat out
// towards it (twice a ship's maximum thrust). One per pilot in play; the pilot can detonate it at any time (Fire button becomes Detonate). It explodes on touching
// anything but a buoy, or when its fuel runs out. The cooldown starts when the missile is gone.
(function () {
var K = VOD.K, S = K.S, STEP = K.STEP, MISSILE = { dv: 2 * K.POWER / STEP, every: .5, boost: 60, safe: 1.5, speed: 100, life: 20, radius: 5 }, BLAST = { r: 110, dmg: 60, push: 2 }; // blast: 60% of full hull at the centre, half of that at the edge
// MISSILE.boost: extra launch speed (px/s) along the ship's course; safe: seconds during which it ignores its own ship. MISSILE.dv: flat-out acceleration over one STEP (px/s), spent in small guidance pulses every `every` s; speed: the closing speed it aims for
var isProjectile = function (u) { return u && u.projectile; };
var mine = function (h, i) { return h.projectiles.filter(function (m) { return m.kind === 'missile' && m.owner === i; }); };

function steer(h, m) { // a guidance pulse: with a clear view of the target, thrust flat out in the direction that cancels the sideways drift and closes in
  var t = h.ships[m.target]; if (!t || t.dead || !h.sight(m.body, t.body, isProjectile).clear) return; // otherwise coast
  var V = h.V, p = m.body.GetPosition(), q = t.body.GetPosition(), v = m.body.GetLinearVelocity(), tv = t.body.GetLinearVelocity(), dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
  var nx = dx / len * MISSILE.speed / S - (v.x - tv.x), ny = dy / len * MISSILE.speed / S - (v.y - tv.y), nl = Math.hypot(nx, ny) || 1, k = MISSILE.dv * MISSILE.every / STEP / S * m.body.GetMass(); // wanted change of velocity gives the direction; the pulse is limited to the engine's budget
  m.body.ApplyImpulse(new V(nx / nl * k, ny / nl * k), m.body.GetWorldCenter());
}

VOD.weapon('missile', {
  label: 'Missile', order: 20,
  targeted: true,
  host: {
    fire: function (h, sh, t) {
      if (mine(h, sh.i).length) return h.nofire(sh, 'a missile is already in flight');
      var p = sh.body.GetPosition(), v = sh.body.GetLinearVelocity(), sp = Math.hypot(v.x, v.y) * S, ang = sp > 5 ? Math.atan2(v.y, v.x) : sh.body.GetAngle(), ux = Math.cos(ang), uy = Math.sin(ang); // leaves along the ship's own course (its nose when it is standing still)
      var m = { kind: 'missile', projectile: true, owner: sh.i, target: t.i, born: h.time, nextPulse: h.time + MISSILE.every, exploding: false,
        hit: function (hh, o) { if (o.kind === 'buoy' || (o.kind === 'ship' && o.i === this.owner && hh.time - this.born < MISSILE.safe)) return; this.exploding = true; } }; // it cannot touch its own ship while pulling away
      m.body = h.body(m, p.x * S + ux * 40, p.y * S + uy * 40, null, MISSILE.radius, 'dynamic'); // starts just ahead of the hull
      m.body.SetBullet(true); m.body.SetFixedRotation(true); m.body.SetLinearVelocity(new h.V(v.x + ux * MISSILE.boost / S, v.y + uy * MISSILE.boost / S)); // the ship's velocity plus a boost along it
      h.projectiles.push(m); steer(h, m); h.events.push({ e: 'launch', i: sh.i }); return true;
    },
    detonate: function (h, i) { var ms = mine(h, i); ms.forEach(function (m) { m.exploding = true; }); return ms.length > 0; },
    before: function (h) { h.projectiles.forEach(function (m) { if (m.kind !== 'missile') return; if (h.time >= m.nextPulse) { steer(h, m); m.nextPulse += MISSILE.every; } if (h.time - m.born > MISSILE.life) m.exploding = true; }); },
    after: function (h) { // explode the flagged missiles (not inside the contact callback), then start their owners' cooldown
      for (var i = h.projectiles.length - 1; i >= 0; i--) {
        var m = h.projectiles[i]; if (m.kind !== 'missile' || !m.exploding) continue;
        var p = m.body.GetPosition(); h.blast(p.x * S, p.y * S, BLAST); h.world.DestroyBody(m.body); h.projectiles.splice(i, 1);
        var ow = h.ships[m.owner]; if (ow) ow.readyAt = h.time + K.WEAPON_CD;
      }
    },
    snapshot: function (h) { // [x, y, owner, vx, vy]
      var r1 = function (v) { return Math.round(v * 10) / 10; };
      return { missiles: h.projectiles.filter(function (m) { return m.kind === 'missile'; }).map(function (m) { var p = m.body.GetPosition(), v = m.body.GetLinearVelocity(); return [r1(p.x * S), r1(p.y * S), m.owner, r1(v.x * S), r1(v.y * S)]; }) };
    }
  },
  client: {
    sound: function (e, v, T) { if (e.e === 'launch') { T.noise(.7, 'bandpass', 400, 1600, 1.2 * v, 0, .12); T.tone(200, 700, .65, 'sawtooth', .12 * v, 0, .1); } }, // a thunk, then a rising whoosh
    canDetonate: function (s, me) { return (s.w.missiles || []).some(function (m) { return m[2] === me; }); }, // then the Fire button detonates
    interp: function (a, b, L) { return { missiles: (a.missiles || []).map(function (m) { const n = (b.missiles || []).find(o => o[2] === m[2]); return n ? [L(m[0], n[0]), L(m[1], n[1]), m[2], L(m[3], n[3]), L(m[4], n[4])] : m; }) }; },
    draw: function (G, I, now) {
      I.w.missiles.forEach(m => {
        const col = G.players[m[2]].color, ang = Math.atan2(m[4], m[3]), fl = 10 + 8 * Math.random();
        ctx.save(); ctx.translate(m[0], m[1]); ctx.rotate(ang);
        ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.moveTo(-5, -3); ctx.lineTo(-5 - fl, 0); ctx.lineTo(-5, 3); ctx.closePath(); ctx.fill();
        ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.fillStyle = '#000'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -5); ctx.lineTo(-6, 5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
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
