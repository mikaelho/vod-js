// Weapon "Harpoon": used like the gun (arm, tap the target), but shorter range, harder hitting, and it reels the two ships in: both are yanked towards each other.
(function () {
var K = VOD.K, S = K.S, RANGE = 260, DMG = 40, YANK = 100, CD = K.WEAPON_CD; // YANK: velocity change in px/s given to each ship, towards the other
var noProjectiles = function (u) { return u && u.projectile; };

VOD.weapon('harpoon', {
  label: 'Harpoon', order: 50,
  targeted: true, range: RANGE,
  host: {
    fire: function (h, sh, t) {
      var V = h.V, p = sh.body.GetPosition(), q = t.body.GetPosition(), x = p.x * S, y = p.y * S, dx = q.x * S - x, dy = q.y * S - y, len = Math.hypot(dx, dy) || 1;
      if (len > RANGE) return h.nofire(sh, 'out of range');
      var r = h.sight(sh.body, t.body, noProjectiles);
      if (!r.clear) return h.nofire(sh, 'no line of sight');
      var ux = dx / len, uy = dy / len, kt = t.body.GetMass() * YANK / S, ks = sh.body.GetMass() * YANK / S;
      t.body.ApplyImpulse(new V(-ux * kt, -uy * kt), t.body.GetWorldCenter()); sh.body.ApplyImpulse(new V(ux * ks, uy * ks), sh.body.GetWorldCenter()); // towards each other
      h.damage(t, DMG);
      h.events.push({ e: 'harpoon', i: sh.i, t: t.i });
      sh.readyAt = h.time + CD; return true;
    }
  },
  client: {
    sound: function (e, v, T) { if (e.e === 'harpoon') { T.tone(700, 200, .4, 'sawtooth', .4 * v); T.tone(1400, 400, .3, 'triangle', .15 * v) } }, // a twang
    fx: function (f, now) { // a rope between the two ships that goes slack as they close in
      if (f.e !== 'harpoon') return;
      const a = 1 - (now - f.at) / 600; if (a <= 0 || !snaps.length) return;
      const I = interp(now - 100), s1 = I.ships[f.i], s2 = I.ships[f.t]; if (!s1 || !s2) return;
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, 2 / sc); ctx.setLineDash([10 / sc, 6 / sc]); ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#fff'; circle(s2.x, s2.y, 7 + 8 * (1 - a)); ctx.fill(); ctx.restore();
    }
  }
});
})();
