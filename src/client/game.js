// ---------- client: state, input ----------
const clock = { off: null };
function onHostMsg(m) {
  if (m.t === 'init') { resetGameState(); G = m; me = m.you; $('lobby').style.display = 'none'; return; }
  if (m.t !== 'snap') return;
  const now = performance.now(), smp = m.ht * 1000 - now; m.at = now; m.tickH = m.ht + m.tin / 1000; // next lock, in host game time
  clock.off = clock.off === null ? smp : clock.off + (smp - clock.off) * .05; // low-pass: arrival-time jitter must not move anything on screen
  snaps.push(m); if (snaps.length > 20) snaps.shift();
  m.ev.forEach(e => { sfx(e); if (e.e === 'win') { over = e.name; showResults(e.res || []); } else { fx.push(Object.assign({ at: now }, e));
    if (e.e === 'nofire' && e.i === me) { toast('Cannot fire: ' + e.why); armed = !!(G && G.targeted); } // stay armed, so another target can be tapped
    if (e.e === 'respawn' && e.i === me) { view.z = Math.min(8, .9 / base()); view.cx = e.x; view.cy = e.y; } } }); // my ship is back: zoom to it
}
const latest = () => snaps[snaps.length - 1];
const PFC = () => VOD.playfields[G.field].client || {}, WC = () => (G.weapon && VOD.weapons[G.weapon].client) || {}; // the playfield's and the weapon's client hooks
function accel(x, y, T) { const p = PFC(); return p.accel ? p.accel(G, x, y, T) : [0, 0]; } // gravity (px/s^2) at host time T, same formula as the host uses
function fly(st, T, dur, pts) { // integrate dur seconds from [x, y, vx, vy] at host time T, optionally collecting the path
  const n = Math.max(1, Math.ceil(dur * 60)), h = dur / n; let [x, y, vx, vy] = st; // 1/60 s steps, same as the host's physics
  for (let i = 0; i < n; i++) { const a = accel(x, y, T + i * h); vx += a[0] * h; vy += a[1] * h; x += vx * h; y += vy * h; if (pts) pts.push([x, y]); }
  return [x, y, vx, vy];
}
let armed = false, toastTimer = null; // targeted weapons: Fire arms, tapping a ship fires, Fire again disarms
function toast(t) { const el = $('toast'); el.textContent = t; el.style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.style.display = 'none', 2200); }
function sendDetonate() { if (iAmHost) sim.detonate(me); else hostConn && hostConn.send({ t: 'detonate' }); }
function sendFire(target) { if (iAmHost) sim.fire(me, target); else hostConn && hostConn.send({ t: 'fire', target }); }
function fireWeapon() { // the Fire button or the space bar
  if (!G || !G.weapon || over) return;
  const s = snaps.length && latest().ships[me], wc = WC();
  if (s && wc.canDetonate && wc.canDetonate(latest(), me)) { armed = false; sendDetonate(); return; } // something of mine is in flight: the button detonates it
  if (!G.targeted) { sendFire(); return; }
  if (armed) { armed = false; sfx({ e: 'disarm' }); } else if (s && !s.dead && s.cd - (performance.now() - latest().at) / 1000 <= 0) { armed = true; sfx({ e: 'arm' }); }
}
function tapTarget(e) { // while armed, a tap on an enemy ship designates it and fires
  if (!G || snaps.length < 2) return false;
  const I = interp(performance.now() - 100), wx = (e.clientX - ox) / sc, wy = (e.clientY - oy) / sc, r = Math.max(30, 44 / sc); let best = -1, bd = 1e9;
  I.ships.forEach((sh, i) => { if (i === me || sh.dead) return; const d = Math.hypot(sh.x - wx, sh.y - wy); if (d < r && d < bd) { bd = d; best = i; } });
  if (best < 0) return false;
  armed = false; sendFire(best); return true;
}
$('bfire').onclick = fireWeapon;
addEventListener('keydown', e => { if (e.code === 'Space' && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) { e.preventDefault(); fireWeapon(); } });
const ONE = { v: 1, t: 1 }; // velocity and thrust factors of a playfield's drag (none)
const FREE = 1; // two planned thrusts: slot 0 is locked (fires at the next tick), slot FREE can still be moved
function plan() { // my ship's expected route: where each thrust fires (F), where it would be without thrust (C), where it ends up (H)
  const I = interp(performance.now() - 100), s = I.s, mine = I.ships[me], tr = Math.max(0, s.tickH - I.th);
  const q = s.ships[me].q.map(a => a.slice()); if (local && local.k === s.k && local.zc === s.ships[me].zc) q[FREE] = [local.x, local.y]; // an impact (zc changes) cancels what I had set
  let T = I.th, cur = [mine.x, mine.y, mine.vx, mine.vy]; const path = [[mine.x, mine.y]], F = [], C = [], H = [], tf = []; let at2 = null;
  cur = fly(cur, T, tr, path); T += tr;
  for (let i = 0; i <= FREE; i++) { const dk = PFC().damp ? PFC().damp(G, cur[0], cur[1], T) : ONE; tf[i] = dk.t; if (dk.v !== 1) cur = [cur[0], cur[1], cur[2] * dk.v, cur[3] * dk.v]; // a playfield may slow the ship and weaken the thrust just before each thrust (clouds)
    F.push([cur[0], cur[1]]); C.push(fly(cur, T, G.step).slice(0, 2)); if (i === FREE) at2 = { st: cur, T };
    cur = fly([cur[0], cur[1], cur[2] + q[i][0] * tf[i] / G.step, cur[3] + q[i][1] * tf[i] / G.step], T, G.step, path); T += G.step; H.push([cur[0], cur[1]]); }
  let crash = null, crashStep = null;
  const blocked = PFC().blocked;
  if (blocked) for (let i = 0; i < path.length && !crash; i += 3) { const p = path[i]; if (blocked(G, p[0], p[1], 20)) { crash = p; path.length = i + 1; const n0 = Math.max(1, Math.ceil(tr * 60)); crashStep = i <= n0 ? 0 : Math.min(FREE, Math.floor((i - n0 - 1) / Math.ceil(G.step * 60))); } }
  return { F, C, H, tf, q, path, at2, crash, crashStep, pw: s.pw[me], k: s.k, zc: s.ships[me].zc, tickH: s.tickH };
}
function setThird(e) {
  if (!G || !snaps.length || over || latest().ships[me].dead) return;
  const P = plan(), w = [(e.clientX - ox) / sc, (e.clientY - oy) / sc];
  const tf = P.tf[FREE], pe = P.pw * tf; // x, y here are the effective thrust (after the playfield's cut); the host gets the commanded one
  let x = w[0] - P.C[FREE][0], y = w[1] - P.C[FREE][1];
  const lim = () => { const len = Math.hypot(x, y); if (len > pe) { x *= pe / len; y *= pe / len; } }; lim();
  for (let it = 0; it < 3 && PFC().accel; it++) { const a = P.at2.st, e = fly([a[0], a[1], a[2] + x / G.step, a[3] + y / G.step], P.at2.T, G.step); x += w[0] - e[0]; y += w[1] - e[1]; lim(); } // with gravity, aim so the dot lands where you put it
  x /= tf; y /= tf; local = { k: P.k, zc: P.zc, x, y };
  const n = performance.now(); if (n - lastSend < 40 && e.type === 'pointermove') return; lastSend = n;
  if (iAmHost) sim.setThrust(me, P.k, x, y); else hostConn && hostConn.send({ t: 'thrust', k: P.k, x, y });
}
// View: drag on empty space to pan, pinch or wheel to zoom, buttons below. Drag inside the free circle (or its dot) to set the thrust.
const view = { z: 1, cx: null, cy: null }, ptrs = new Map(); let mode = null, buoyFx = -1e9;
// Everything a game leaves behind on this page. Called whenever a game starts (and when leaving one), so nothing carries over from the previous game.
function resetGameState() {
  G = null; snaps = []; fx = []; local = null; over = null; armed = false; pressed = false; lastSend = 0; buoyFx = -1e9;
  view.z = 1; view.cx = null; view.cy = null; clock.off = null; ptrs.clear(); mode = null; hideResults();
}
const base = () => Math.min(vw() / G.W, vh() / G.H);
function zoomAt(x, y, f) { const wx = (x - ox) / sc, wy = (y - oy) / sc; view.z = Math.min(6, Math.max(.5, view.z * f)); const s2 = base() * view.z;
  view.cx = wx - (x - vw() / 2) / s2; view.cy = wy - (y - vh() / 2) / s2; }
function hitThrust(e) { if (!G || snaps.length < 2 || over || latest().ships[me].dead) return false; const P = plan();
  return Math.hypot(e.clientX - (P.H[FREE][0] * sc + ox), e.clientY - (P.H[FREE][1] * sc + oy)) < 70 || Math.hypot(e.clientX - (P.C[FREE][0] * sc + ox), e.clientY - (P.C[FREE][1] * sc + oy)) < Math.max(P.pw * P.tf[FREE] * sc * 1.3, 80); }
$('c').addEventListener('wheel', e => { e.preventDefault(); if (G) zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
$('c').addEventListener('pointerdown', e => { if (armed && tapTarget(e)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }); try { $('c').setPointerCapture(e.pointerId); } catch (_) {}
  if (ptrs.size === 1) { if (hitThrust(e)) { mode = 'thrust'; setThird(e); } else mode = 'pan'; } else mode = 'pinch'; });
$('c').addEventListener('pointermove', e => { const o = ptrs.get(e.pointerId); if (!o || !G) return;
  if (mode === 'thrust') { o.x = e.clientX; o.y = e.clientY; setThird(e); }
  else if (mode === 'pan') { if (!o.mv && Math.hypot(e.clientX - o.sx, e.clientY - o.sy) < 8) return; o.mv = true; view.cx -= (e.clientX - o.x) / sc; view.cy -= (e.clientY - o.y) / sc; o.x = e.clientX; o.y = e.clientY; }
  else if (mode === 'pinch' && ptrs.size === 2) { const [a, b] = [...ptrs.values()], d0 = Math.hypot(a.x - b.x, a.y - b.y), m0 = [(a.x + b.x) / 2, (a.y + b.y) / 2]; o.x = e.clientX; o.y = e.clientY;
    const d1 = Math.hypot(a.x - b.x, a.y - b.y), m1 = [(a.x + b.x) / 2, (a.y + b.y) / 2]; if (d0 > 0) zoomAt(m1[0], m1[1], d1 / d0); view.cx -= (m1[0] - m0[0]) / sc; view.cy -= (m1[1] - m0[1]) / sc; } });
const endPtr = e => { if (!ptrs.delete(e.pointerId)) return;
  if (mode === 'thrust') { lastSend = 0; setThird({ type: 'up', clientX: e.clientX, clientY: e.clientY }); }
  mode = ptrs.size === 1 ? 'pan' : null; };
addEventListener('pointerup', endPtr); addEventListener('pointercancel', endPtr);

