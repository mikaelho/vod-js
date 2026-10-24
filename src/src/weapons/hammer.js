// Weapon "Hammer": a heavy ball whirling round the ship on a tether. Not out at the start: the Fire button deploys it, and retracts it again (no cooldown).
// It takes no damage; a ship it strikes loses hull (dmg % at full swing speed). It hits everything except buoys: a ship is knocked by the swing (its velocity changes, physics-style) and loses its planned thrusts and hull;
// a rock is knocked the same way, and either way the owner gets the equal and opposite push through the tether; walls, rings, the planet and moons throw the hammer's owner back; a missile or mine it touches goes off.
// The ball is a sensor driven round the ship each physics step; the knock is worked out in hit(). It is retracted when its owner is destroyed.
(function () {
var K = VOD.K, S = K.S, HAMMER = { R: 85, w: 2.5, rad: 17, kick: .6, again: .4, dmg: 30 }; // R: tether length px, w: rad/s, kick: share of the swing's relative velocity handed to the ship, again: s before the same ship can be hit again
var find = function (h, i) { return (h.ws.hammers || []).filter(function (m) { return m.owner === i; })[0]; };
var drop = function (h, m) { h.world.DestroyBody(m.body); h.ws.hammers.splice(h.ws.hammers.indexOf(m), 1); };

VOD.weapon('hammer', {
  label: 'Hammer', order: 40,
  targeted: false,
  host: {
    fire: function (h, sh) { // toggles
      h.ws.hammers = h.ws.hammers || []; var m = find(h, sh.i);
      if (m) { drop(h, m); h.events.push({ e: 'retract', i: sh.i }); return true; }
      var p = sh.body.GetPosition(); m = { kind: 'hammer', projectile: true, owner: sh.i, a: sh.body.GetAngle(),
        hit: function (hh, o) {
          var k = o && o.kind, ow = hh.ships[this.owner];
          if (!o || k === 'buoy' || k === 'hammer' || o === ow) return;
          if (k === 'missile' || k === 'mine') { o.exploding = true; return; } // a swatted weapon goes off
          var key = 'ham' + this.owner; if (hh.time < (o[key] || 0)) return; o[key] = hh.time + HAMMER.again;
          var vb = this.body.GetLinearVelocity(), bp = this.body.GetPosition(), x = Math.round(bp.x * S), y = Math.round(bp.y * S), V = hh.V;
          if (k === 'ship') { // not a wreck or a fresh respawn
            if (o.dead || hh.time < o.inv) return;
            var vs = o.body.GetLinearVelocity(), mm = o.body.GetMass() * HAMMER.kick, rx = (vb.x - vs.x) * mm, ry = (vb.y - vs.y) * mm; // (GetLinearVelocity returns the live vector, so the swing is worked out before anything is applied)
            o.body.ApplyImpulse(new V(rx, ry), o.body.GetWorldCenter()); o.q = [[0, 0], [0, 0]]; o.zc++;
            ow.body.ApplyImpulse(new V(-rx, -ry), ow.body.GetWorldCenter()); // equal and opposite: the tether pulls the owner back
            hh.damage(o, HAMMER.dmg * Math.min(1.5, Math.hypot(rx, ry) / mm / (HAMMER.w * HAMMER.R / S))); // the harder the swing meets it, the more it hurts
            hh.events.push({ e: 'bonk', i: o.i, x: x, y: y });
          } else if (o.body.GetType() === hh.b2.Dynamics.b2Body.b2_dynamicBody) { // a rock: a heavy one hardly moves, and the owner's recoil is capped at what a ship hit would give
            var vr = o.body.GetLinearVelocity(), mr = Math.min(o.body.GetMass() * HAMMER.kick, ow.body.GetMass() * HAMMER.kick), rx = (vb.x - vr.x) * mr, ry = (vb.y - vr.y) * mr;
            o.body.ApplyImpulse(new V(rx, ry), o.body.GetWorldCenter()); hh.events.push({ e: 'bonk', x: x, y: y });
            ow.body.ApplyImpulse(new V(-rx, -ry), ow.body.GetWorldCenter()); // equal and opposite
          } else if (!ow.dead) { // something fixed: the swing comes to a halt and jerks the owner back
            var vo = ow.body.GetLinearVelocity(), mo = ow.body.GetMass() * HAMMER.kick * .5;
            ow.body.ApplyImpulse(new V((vo.x - vb.x) * mo, (vo.y - vb.y) * mo), ow.body.GetWorldCenter()); hh.events.push({ e: 'bonk', x: x, y: y });
          }
        } };
      m.body = h.body(m, p.x * S, p.y * S, null, HAMMER.rad); // a sensor
      h.ws.hammers.push(m); h.events.push({ e: 'deploy', i: sh.i }); return true;
    },
    before: function (h) { // every step: carry each ball round its ship
      (h.ws.hammers || []).slice().forEach(function (m) {
        var sh = h.ships[m.owner]; if (sh.dead) { drop(h, m); return; }
        m.a += HAMMER.w * K.FIX; var p = sh.body.GetPosition(), v = sh.body.GetLinearVelocity(), c = Math.cos(m.a), s = Math.sin(m.a), R = HAMMER.R / S;
        m.body.SetPosition(new h.V(p.x + c * R, p.y + s * R));
        m.body.SetLinearVelocity(new h.V(v.x - s * R * HAMMER.w, v.y + c * R * HAMMER.w)); // the ship's velocity plus the swing
      });
    },
    init: function () { return { R: HAMMER.R }; },
    snapshot: function (h) { var r1 = function (v) { return Math.round(v * 10) / 10; }; return { hammers: (h.ws.hammers || []).map(function (m) { var p = m.body.GetPosition(); return [r1(p.x * S), r1(p.y * S), m.owner]; }) }; }
  },
  client: {
    sound: function (e, v, T) {
      if (e.e === 'deploy') { T.tone(120, 520, .4, 'sawtooth', .25 * v, 0, .08); T.noise(.4, 'bandpass', 500, 1500, .6 * v, 0, .1); }
      else if (e.e === 'retract') { T.tone(520, 120, .3, 'sawtooth', .25 * v, 0, .05); T.noise(.3, 'bandpass', 1500, 500, .5 * v, 0, .06); }
      else if (e.e === 'bonk') { T.tone(310, 300, .4, 'triangle', .45 * v); T.tone(487, 480, .35, 'sine', .2 * v); T.tone(780, 770, .25, 'sine', .1 * v); }
    },
    verb: function (s, me) { return (s.w.hammers || []).some(function (m) { return m[2] === me; }) ? 'Retract' : 'Deploy'; }, // button: "Deploy Hammer" / "Retract Hammer"
    interp: function (a, b, L) { return { hammers: (a.hammers || []).map(function (m) { const n = (b.hammers || []).find(o => o[2] === m[2]); return n ? [L(m[0], n[0]), L(m[1], n[1]), m[2]] : m; }) }; },
    draw: function (G, I, now) {
      I.w.hammers.forEach(m => {
        const sh = I.ships[m[2]], col = G.players[m[2]].color; if (!sh) return;
        ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = .7; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(m[0], m[1]); ctx.stroke(); ctx.globalAlpha = 1; // the tether
        ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.fillStyle = '#000'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; circle(m[0], m[1], 17); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0; ctx.fillStyle = col; circle(m[0], m[1], 6); ctx.fill(); ctx.restore();
      });
    },
    fx: function (f, now) { // a knock: a ring where the ship was struck
      if (f.e !== 'bonk') return;
      const t = (now - f.at) / 500; if (t >= 1) return;
      ctx.save(); ctx.globalAlpha = 1 - t; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(3, 3 / sc); circle(f.x, f.y, 25 + 55 * t); ctx.stroke(); ctx.restore();
    }
  }
});
})();
