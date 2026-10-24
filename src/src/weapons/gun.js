// Weapon "Gun": instant hit on the designated ship if it is within range and in the clear; weak, with half the usual cooldown. VOD.weapon(id, def) - see src/README.md.
(function () {
var S = VOD.K.S, RANGE = 320, DMG = 25, CD = VOD.K.WEAPON_CD / 2;
var noProjectiles = function (u) { return u && u.projectile; };

VOD.weapon('gun', {
  label: 'Gun', order: 10,
  targeted: true,   // the pilot arms it, then taps the target ship; host.fire(i, target) gets that ship
  range: RANGE,     // shown to the pilot as a circle while aiming
  host: {
    fire: function (h, sh, t) { // called only when the pilot is alive and off cooldown; return true when fired (and set sh.readyAt), or h.nofire(sh, 'reason')
      var V = h.V, p = sh.body.GetPosition(), q = t.body.GetPosition(), x = p.x * S, y = p.y * S, dx = q.x * S - x, dy = q.y * S - y, len = Math.hypot(dx, dy) || 1;
      if (len > RANGE) return h.nofire(sh, 'out of range');
      var r = h.sight(sh.body, t.body, noProjectiles);
      if (!r.clear) return h.nofire(sh, 'no line of sight');
      h.damage(t, DMG); t.body.ApplyImpulse(new V(dx / len * .15, dy / len * .15), t.body.GetWorldCenter()); // a small shove
      h.events.push({ e: 'shot', i: sh.i, x1: Math.round(x), y1: Math.round(y), x2: Math.round(r.pt.x * S), y2: Math.round(r.pt.y * S), hit: true });
      sh.readyAt = h.time + CD; return true;
    }
  },
  client: {
    sound: function (e, v, T) { if (e.e === 'shot') { T.tone(1500, 260, .16, 'sawtooth', .3 * v); T.tone(750, 130, .14, 'square', .12 * v); T.noise(.08, 'bandpass', 2500, 1200, .3 * v); } }, // a sharp crack
    fx: function (f, now) { // draws one host event (f.e, f.at = arrival time) per frame; events live 0.7 s
      if (f.e !== 'shot') return;
      const a = 1 - (now - f.at) / 260; if (a <= 0) return; // gun tracer
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, 2 / sc); ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      if (f.hit) { ctx.fillStyle = '#fff'; circle(f.x2, f.y2, 8 + 10 * (1 - a)); ctx.fill(); } ctx.restore();
    }
  }
});
})();
