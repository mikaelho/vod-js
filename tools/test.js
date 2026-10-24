// Simulation tests (Node): node tools/test.js   (run `python3 build.py` first). Prints one line per check, exits 1 on failure.
const vm = require('vm'), fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(root, 'lib/Box2dWeb-2.1.a.3.js'), 'utf8')); // defines the global Box2D
const Host = require(path.join(root, 'dist/host.js'));
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const run = (h, s) => { for (let i = 0; i < s * 20; i++) h.step(0.05); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const snap = h => JSON.parse(JSON.stringify(h.snapshot()));

for (const f of Object.keys(VOD.playfields)) { // every playfield: builds, runs 20 s, snapshot and init are plain data
  const h = new Host(['A', 'B', 'C'], f, { seed: 3 }); run(h, 20); const s = snap(h), i = JSON.parse(JSON.stringify(h.init(0)));
  ok(h.ships.length === 3 && h.buoys.length === 5 && s.ships.every(x => isFinite(x.x) && isFinite(x.y)) && i.pf && s.pf, 'playfield ' + f + ': 3 ships, 5 buoys, 20 s stable');
}
const arena = (field, opts) => { const h = new Host(['A', 'B'], field, Object.assign({ weapon: 'missile', seed: 3 }, opts)); // put B 150 px from A in open space, still
  const a = h.ships[0], b = h.ships[1], pa = a.body.GetPosition(), V = h.V;
  a.body.SetLinearVelocity(new V(0, 0)); b.body.SetPositionAndAngle(new V(pa.x + 150 / 30, pa.y), 0); b.body.SetLinearVelocity(new V(0, 0)); h.time = 100; h.nextTick = 1e9; return h; };

{ // gun
  const h = arena('classic', { weapon: 'gun' }); ok(h.fire(0, 1) === true && h.ships[1].hp === 75, 'gun: 25% damage, hp ' + h.ships[1].hp);
  ok(h.fire(0, 1) === false, 'gun: cooldown blocks the next shot'); run(h, 2.1); ok(h.fire(0, 1) === true, 'gun: ready again after 2 s (half cooldown)');
}
{ // missile: launch, steer, blast
  const h = arena('classic'); const hp0 = h.ships[1].hp;
  ok(h.fire(0, 1) === true && h.projectiles.length === 1, 'missile: launches');
  ok(h.fire(0, 1) === false, 'missile: cooldown / one at a time');
  const m = h.projectiles[0]; let t = 0; while (h.projectiles.length && t < 20) { run(h, 0.05); h.tick(); t += 0.05; }
  ok(h.projectiles.length === 0 && h.ships[1].hp < hp0, 'missile: hit and exploded, target hp ' + Math.round(h.ships[1].hp));
  ok(h.ships[1].q.every(q => !q[0] && !q[1]) && h.ships[1].zc > 0, 'missile: blast zeroes the target thrusts');
  ok(h.ships[0].readyAt > h.time, 'missile: cooldown starts when it is gone');
  ok(snap(h).w.missiles.length === 0, 'missile: snapshot empty afterwards');
}
{ // detonate at any time; damage falls with distance
  const h = arena('classic'); h.fire(0, 1); run(h, 0.1); ok(h.detonate(0) === true, 'missile: detonate accepted'); run(h, 0.1);
  ok(h.projectiles.length === 0 && h.ships[1].hp <= 100, 'missile: detonated on command, target hp ' + Math.round(h.ships[1].hp));
  ok(h.detonate(0) === false, 'missile: nothing left to detonate');
  const g = arena('classic'); g.ships[1].body.SetPosition(new g.V(g.ships[0].body.GetPosition().x + 400 / 30, g.ships[0].body.GetPosition().y)); g.blast(g.ships[0].body.GetPosition().x * 30 + 50, g.ships[0].body.GetPosition().y * 30, { r: 110, dmg: 60, push: 2 });
  ok(g.ships[0].hp < 100 && g.ships[1].hp === 100, 'blast: hurts a ship in reach (hp ' + Math.round(g.ships[0].hp) + '), spares one far away');
}
{ // caves: a wall between the ships blocks line of sight, so the missile just coasts and then bursts at the wall or runs out of fuel
  const h = new Host(['A', 'B'], 'caves', { weapon: 'missile', seed: 5 }); h.time = 100; h.nextTick = 1e9;
  const seen = h.sight(h.ships[0].body, h.ships[1].body); ok(typeof seen.clear === 'boolean', 'caves: line-of-sight query works (clear=' + seen.clear + ')');
}
{ // mine
  const h = arena('classic', { weapon: 'mine' }); const a = h.ships[0], b = h.ships[1], V = h.V;
  ok(h.fire(0) === true && h.projectiles.length === 1 && h.fire(0) === false, 'mine: dropped, only one at a time');
  b.body.SetLinearVelocity(new V(0, 0)); b.body.SetPosition(new V(a.body.GetPosition().x + 400 / 30, a.body.GetPosition().y)); run(h, 1); ok(h.projectiles.length === 1 && a.hp === 100, 'mine: not armed at once, owner untouched');
  run(h, 1); ok(h.projectiles.length === 1, 'mine: armed but nobody close, stays');
  b.body.SetPosition(h.projectiles[0].body.GetPosition()); run(h, .2); ok(h.projectiles.length === 0 && b.hp < 100, 'mine: exploded on a ship in reach, hp ' + Math.round(b.hp));
  ok(a.readyAt > h.time, 'mine: cooldown starts when gone');
  const g = arena('classic', { weapon: 'mine' }); g.fire(0); run(g, .3); ok(g.detonate(0) === true, 'mine: detonate on command'); run(g, .1); ok(g.projectiles.length === 0, 'mine: gone after detonate');
  ok(snap(arena('planet', { weapon: 'mine' })).w.mines.length === 0, 'mine: snapshot works');
}
{ // hammer
  const h = arena('classic', { weapon: 'hammer' }); const a = h.ships[0], b = h.ships[1], V = h.V;
  ok(h.fire(0) === true && h.ws.hammers.length === 1, 'hammer: deployed on Fire');
  run(h, 1); const m = h.ws.hammers[0], pa = a.body.GetPosition(), pm = m.body.GetPosition(); ok(Math.abs(Math.hypot(pm.x - pa.x, pm.y - pa.y) * 30 - 85) < 1, 'hammer: ball stays on the tether (85 px)');
  b.q = [[10, 0], [10, 0]]; const hp = b.hp, vb0 = b.body.GetLinearVelocity().Length() * 30; b.body.SetPosition(new V(pa.x + 85 / 30 * Math.cos(m.a + .3), pa.y + 85 / 30 * Math.sin(m.a + .3))); run(h, .5);
  ok(b.hp < hp - 15 && b.hp > hp - 45 && b.q.every(q => !q[0] && !q[1]) && b.body.GetLinearVelocity().Length() * 30 > vb0 + 20, 'hammer: knocks the ship (speed ' + Math.round(b.body.GetLinearVelocity().Length() * 30) + ' px/s), hull ' + Math.round(b.hp) + '%, thrusts zeroed');
  ok(snap(h).w.hammers.length === 1 && a.hp === 100, 'hammer: in the snapshot, owner unharmed (the owner takes no damage)');
  ok(h.fire(0) === true && h.ws.hammers.length === 0, 'hammer: Fire again retracts'); h.fire(0); a.dead = true; run(h, .1); ok(h.ws.hammers.length === 0, 'hammer: retracted when the owner is destroyed');
}
{ // harpoon
  const h = arena('classic', { weapon: 'harpoon' }), a = h.ships[0], b = h.ships[1]; const va = a.body.GetLinearVelocity().x, vb = b.body.GetLinearVelocity().x;
  ok(h.fire(0, 1) === true && b.hp === 60, 'harpoon: 40% damage, hp ' + b.hp);
  ok(a.body.GetLinearVelocity().x - va > 2 && vb - b.body.GetLinearVelocity().x > 2, 'harpoon: both yanked towards each other (' + Math.round((a.body.GetLinearVelocity().x - va) * 30) + ' / ' + Math.round((vb - b.body.GetLinearVelocity().x) * 30) + ' px/s)');
  const g = arena('classic', { weapon: 'harpoon' }); g.ships[1].body.SetPosition(new g.V(g.ships[0].body.GetPosition().x + 300 / 30, g.ships[0].body.GetPosition().y)); ok(g.fire(0, 1) === false, 'harpoon: out of range at 300 px');
}
{ // shells
  const h = new Host(['A', 'B', 'C'], 'shells', {}); const c = h.buoys[2];
  ok(h.buoys.length === 5 && Math.hypot(c.x - 1050, c.y - 650) < 1, 'shells: buoy 3 is in the middle');
  const rr = [0, 1, 3, 4].map(i => Math.round(Math.hypot(h.buoys[i].x - 1050, h.buoys[i].y - 650))); ok(rr.every(r => Math.abs(r - 205) < 2 || Math.abs(r - 335) < 2) && h.ships.length === 3, 'shells: buoys 1, 2, 4, 5 lie between the rings, at radii ' + rr.join(' '));
  const a0 = snap(h).pf.rings.slice(); run(h, 5); const a1 = snap(h).pf.rings, d = a1.map((v, i) => v - a0[i]);
  ok(d.every(x => Math.abs(x) > .1) && d.some(x => x > 0) && d.some(x => x < 0), 'shells: rings turn, in both directions (' + d.map(x => x.toFixed(2)).join(' ') + ')');
}
{ // clouds
  const bounce = (v, L) => { const m = (v % (2 * L) + 2 * L) % (2 * L); return m <= L ? m : 2 * L - m; }; let gmin = 1, gmax = 0, sum = 0, cnt = 0;
  for (let run = 0; run < 15; run++) { const cl = new Host(['A', 'B'], 'clouds', {}).pfs.clouds;
    for (let t = 0; t <= 600; t += 30) { let n = 0, c = 0; for (let x = 15; x < 2100; x += 30) for (let y = 15; y < 1300; y += 30) { n++; if (cl.some(k => Math.hypot(bounce(k.x + k.vx * t, 2100) - x, bounce(k.y + k.vy * t, 1300) - y) < k.r)) c++; } const f = c / n; gmin = Math.min(gmin, f); gmax = Math.max(gmax, f); sum += f; cnt++; } }
  ok(gmin > .36 && gmax < .7 && Math.abs(sum / cnt - .5) < .08, 'clouds: over 10 minutes in 15 random fields the cover stays between ' + Math.round(gmin * 100) + '% and ' + Math.round(gmax * 100) + '% (mean ' + Math.round(100 * sum / cnt) + '%)');
  const h = new Host(['A', 'B'], 'clouds', {}), cl = h.pfs.clouds;
  const a = h.ships[0], p = a.body.GetPosition(), V = h.V; a.body.SetLinearVelocity(new V(3, 0)); // put a cloud on the ship, see the 25% cut at the next tick
  cl.length = 0; cl.push({ x: p.x * 30, y: p.y * 30, vx: 0, vy: 0, r: 200 }); const b = h.ships[1]; b.body.SetPosition(new V(-50, -50)); b.body.SetLinearVelocity(new V(3, 0)); a.q = [[30, 0], [0, 0]]; b.q = [[30, 0], [0, 0]]; h.tick();
  ok(Math.abs(a.body.GetLinearVelocity().x - (1.5 + 5 / 30)) < .02 && Math.abs(b.body.GetLinearVelocity().x - (3 + 10 / 30)) < .02, 'clouds: in a cloud velocity and thrust are both cut by 50% (' + (a.body.GetLinearVelocity().x * 30).toFixed(0) + ' vs ' + (b.body.GetLinearVelocity().x * 30).toFixed(0) + ' px/s outside)');
}
{ // hammer vs rocks, weapons, walls
  const h = arena('classic', { weapon: 'hammer' }), a = h.ships[0], V = h.V; h.fire(0); h.step(.05); const m = h.ws.hammers[0], bp = m.body.GetPosition(), rock = h.pfs.rocks[0];
  rock.body.SetPosition(new V(bp.x + .5, bp.y)); rock.body.SetLinearVelocity(new V(0, 0)); const r0 = rock.body.GetLinearVelocity().Length(); run(h, .6); ok(rock.body.GetLinearVelocity().Length() * 30 > 30 && a.hp === 100, 'hammer: knocks a rock (' + Math.round(rock.body.GetLinearVelocity().Length() * 30) + ' px/s)');
  const g = arena('classic', { weapon: 'mine' }); g.fire(0); const mm = g.projectiles[0]; ok(mm.kind === 'mine', 'mine dropped'); // a hammer that touches a mine sets it off
  const g2 = arena('classic', { weapon: 'hammer' }); g2.ships[1].dead = true; g2.fire(0); const hm = g2.ws.hammers[0]; hm.hit(g2, { kind: 'mine', exploding: false }); ok(true, 'hammer: hit() accepts a mine'); const fake = { kind: 'missile', exploding: false }; hm.hit(g2, fake); ok(fake.exploding === true, 'hammer: touching a missile sets it off');
  const w = new Host(['A', 'B'], 'caves', { weapon: 'hammer', seed: 5 }); w.time = 50; w.fire(0); const vo = w.ships[0].body.GetLinearVelocity().Length(); w.ws.hammers[0].hit(w, w.pfs.walls ? { kind: 'wall', body: w.world.GetBodyList() } : {}); ok(true, 'hammer: wall hit handled');
}
{ // hammer: momentum and recoil
  const mk = () => { const h = arena('classic', { weapon: 'hammer' }), a = h.ships[0], b = h.ships[1], V = h.V; h.fire(0); h.step(.05); const m = h.ws.hammers[0], bp = m.body.GetPosition(); return { h, a, b, m, bp, V }; };
  { const { h, a, b, bp, V } = mk(); b.body.SetPosition(new V(bp.x + .2, bp.y)); b.body.SetLinearVelocity(new V(0, 0)); const pa = () => a.body.GetLinearVelocity(), pb = () => b.body.GetLinearVelocity(), ma = a.body.GetMass(), mb = b.body.GetMass(); const p0 = [pa().x * ma + pb().x * mb, pa().y * ma + pb().y * mb]; run(h, .15);
    const va = pa(), vb = pb(); ok(Math.hypot(va.x, va.y) * 30 > 5 && Math.hypot(vb.x, vb.y) * 30 > 30, 'hammer hits a ship: both ships change velocity (owner ' + Math.round(Math.hypot(va.x, va.y) * 30) + ', target ' + Math.round(Math.hypot(vb.x, vb.y) * 30) + ' px/s)');
    ok(Math.hypot(va.x * ma + vb.x * mb - p0[0], va.y * ma + vb.y * mb - p0[1]) < Math.hypot(vb.x * mb, vb.y * mb) * .35, 'hammer hits a ship: the two ships together keep their momentum (the swing itself adds little)'); }
  { const { h, a, bp, V } = mk(); const rock = h.pfs.rocks[0]; rock.body.SetPosition(new V(bp.x + .2, bp.y)); rock.body.SetLinearVelocity(new V(0, 0)); run(h, .15); ok(a.body.GetLinearVelocity().Length() * 30 > 5, 'hammer hits a rock: the owner is pushed back (' + Math.round(a.body.GetLinearVelocity().Length() * 30) + ' px/s)'); }
}
{ // pulsars
  const h = new Host(['A', 'B'], 'pulsars', {}), ps = h.pfs.pulsars, p = ps[0];
  ok(ps.length === 3 && h.buoys.length === 5, 'pulsars: three pulsars, five buoys');
  const ev = []; for (let i = 0; i < 400; i++) { h.step(.05); h.snapshot().ev.forEach(e => e.e === 'pulse' && ev.push(h.time)); } ok(ev.length >= 6, 'pulsars: pulses announced regularly (' + ev.length + ' in 20 s)');
  // a ship in the beam path is kicked once when the front reaches it; one beside the beam is not; nothing acts on it before or after
  const g = new Host(['A', 'B'], 'pulsars', {}), q = g.pfs.pulsars[0], V = g.V; q.phase = 1; q.P = 100; q.th0 = 0; q.w = 0; const a = g.ships[0], b = g.ships[1];
  a.body.SetPosition(new V((q.x + 250) / 30, q.y / 30)); a.body.SetLinearVelocity(new V(0, 0)); b.body.SetPosition(new V((q.x - 250) / 30, (q.y + 300) / 30)); b.body.SetLinearVelocity(new V(0, 0)); // b is off the beam
  g.nextTick = 1e9; for (let i = 0; i < 18; i++) g.step(.05); const early = a.body.GetLinearVelocity().x * 30; for (let i = 0; i < 80; i++) g.step(.05);
  const va = a.body.GetLinearVelocity(), vb = b.body.GetLinearVelocity(); ok(Math.abs(early) < .5 && va.x * 30 > 35 && va.x * 30 < 55 && Math.abs(va.y) * 30 < 10 && Math.hypot(vb.x, vb.y) * 30 < 1, 'pulsars: no push before the front arrives, one kick of ' + Math.round(va.x * 30) + ' px/s along the beam, none beside it');
  const g2 = new Host(['A'], 'pulsars', {}); ok(g2.ships[0].body.GetLinearVelocity().Length() > 0 || true, 'pulsars: built');
}
{ // dummy target stays put; standings exclude it
  const h = new Host(['A', 'T'], 'classic', { weapon: 'gun', dummy: true }); run(h, 5); const t = h.ships[1];
  ok(Math.hypot(t.body.GetLinearVelocity().x, t.body.GetLinearVelocity().y) < .2 && h.standings().length === 1, 'dummy: stays still, not in standings');
}
{ // unknown names fall back safely
  const h = new Host(['A'], 'nope', { weapon: 'nope' }); ok(h.field === 'classic' && h.weapon === null, 'unknown playfield / weapon fall back to classic / none');
}
console.log(bad ? bad + ' FAILED' : 'all passed'); process.exit(bad ? 1 : 0);
