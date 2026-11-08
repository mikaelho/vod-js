// Weapon "Gun": instant hit on the designated ship if it is within range and in the clear; weak, with half the usual cooldown. VOD.weapon(id, def) - see src/README.md.
(function () {
var S = VOD.K.S, RANGE = 320, DMG = 25, CD = VOD.K.WEAPON_CD / 2;
var clearOf = function (t) { return function (u) { return u && u.projectile && u !== t; }; }; // projectiles do not block the shot, except the target itself

VOD.weapon('gun', {
  label: 'Gun', order: 10,
  targeted: true,   // the pilot arms it, then taps the target ship; host.fire(i, target) gets that ship
  range: RANGE,     // shown to the pilot as a circle while aiming
  hits: ['missile'], // besides ships, it can shoot down a missile in flight (the pilot taps the missile)
  host: {
    fire: function (h, sh, t) { // called only when the pilot is alive and off cooldown; return true when fired (and set sh.readyAt), or h.nofire(sh, 'reason')
      var V = h.V, p = sh.body.GetPosition(), q = t.body.GetPosition(), x = p.x * S, y = p.y * S, dx = q.x * S - x, dy = q.y * S - y, len = Math.hypot(dx, dy) || 1;
      if (len > RANGE) return h.nofire(sh, 'out of range');
      var r = h.sight(sh.body, t.body, clearOf(t));
      if (!r.clear) return h.nofire(sh, 'no line of sight');
      if (t.kind === 'missile') { t.exploding = true; h.events.push({ e: 'shot', i: sh.i, x1: Math.round(x), y1: Math.round(y), x2: Math.round(q.x * S), y2: Math.round(q.y * S), hit: true }); sh.readyAt = h.time + CD; return true; } // shot down: it explodes where it is
      h.damage(t, DMG); t.body.ApplyImpulse(new V(dx / len * .15, dy / len * .15), t.body.GetWorldCenter()); // a small shove
      h.events.push({ e: 'shot', i: sh.i, x1: Math.round(x), y1: Math.round(y), x2: Math.round(r.pt.x * S), y2: Math.round(r.pt.y * S), hit: true });
      sh.readyAt = h.time + CD; return true;
    }
  },
  client: {
    sound: function (e, v, T) { if (e.e !== 'shot') return; const c = SND.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(); // the minimal laser: a short sine zap sliding from 1200 to 300 Hz in 80 ms
      o.type = 'sine'; o.frequency.setValueAtTime(1200, t); o.frequency.exponentialRampToValueAtTime(300, t + .08); g.gain.setValueAtTime(.25 * v, t); g.gain.exponentialRampToValueAtTime(.001, t + .08); o.connect(g); g.connect(SND.master); o.start(t); o.stop(t + .09); },
    fx: function (f, now) { // draws one host event (f.e, f.at = arrival time) per frame; events live 0.7 s
      if (f.e !== 'shot') return;
      const a = 1 - (now - f.at) / 260; if (a <= 0) return; // gun tracer
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, 2 / sc); ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      if (f.hit) { ctx.fillStyle = '#fff'; circle(f.x2, f.y2, 8 + 10 * (1 - a)); ctx.fill(); } ctx.restore();
    }
  }
});
})();
