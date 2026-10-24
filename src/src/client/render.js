// ---------- rendering ----------
function interp(rt) { // state at local time rt, placed on the host's game clock; s = the snapshot whose queue and lock time apply at that moment
  const th = (rt + clock.off) / 1000; let a = snaps[0], b = snaps[0];
  for (let i = snaps.length - 1; i >= 0; i--) if (snaps[i].ht <= th) { a = snaps[i]; b = snaps[i + 1] || a; break; }
  const pfc = PFC(), wc = WC(), f = b.ht > a.ht ? Math.min(1, Math.max(0, (th - a.ht) / (b.ht - a.ht))) : 0, L = (u, v) => u + (v - u) * f;
  const ang = (u, v) => { let d = v - u; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; return u + d * f; };
  return { s: th < a.tickH ? a : b, th,
           ships: a.ships.map((s, i) => Object.assign({}, b.ships[i], { x: L(s.x, b.ships[i].x), y: L(s.y, b.ships[i].y), vx: L(s.vx, b.ships[i].vx), vy: L(s.vy, b.ships[i].vy), a: ang(s.a, b.ships[i].a) })),
           pf: pfc.interp ? pfc.interp(a.pf, b.pf, L, ang) : {}, w: wc.interp ? wc.interp(a.w, b.w, L, ang) : {} };
}
function poly(pts, close) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); if (close) ctx.closePath(); }
function smooth(p) { const n = p.length, m = i => [(p[i][0] + p[(i + 1) % n][0]) / 2, (p[i][1] + p[(i + 1) % n][1]) / 2]; ctx.beginPath(); const s = m(n - 1); ctx.moveTo(s[0], s[1]);
  for (let i = 0; i < n; i++) { const e = m(i); ctx.quadraticCurveTo(p[i][0], p[i][1], e[0], e[1]); } ctx.closePath(); }
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); }
function frame() {
  requestAnimationFrame(frame);
  const dpr = devicePixelRatio || 1, cv = $('c'), w = vw(), h = vh();
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  if (!G || snaps.length < 2) return;
  if (view.cx === null) { view.cx = G.W / 2; view.cy = G.H / 2; }
  sc = Math.min(w / G.W, h / G.H) * view.z; ox = w / 2 - view.cx * sc; oy = h / 2 - view.cy * sc;
  ctx.translate(ox, oy); ctx.scale(sc, sc);
  const now = performance.now(), I = interp(now - 100), s = latest(), pfc = PFC(), wc = WC(); fx = fx.filter(f => now - f.at < (f.e === 'boom' ? 1500 : 700));
  ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, G.W, G.H);
  if (pfc.draw) pfc.draw(G, I); // the playfield's background: obstacles, planet, walls
  // buoys
  G.buoys.forEach(b => { const f = fx.find(f => f.e === 'buoy' && f.n === b[0]), k = f ? 1 + .25 * Math.sin((now - f.at) / 700 * Math.PI) : 1;
    ctx.save(); ctx.shadowColor = '#fff'; ctx.shadowBlur = 20; circle(b[1], b[2], 15 * k); ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = '20px Optima,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b[0], b[1], b[2] + 1); });
  { const nb = G.buoys.find(b => b[0] === s.ships[me].n + 1); // highlight the next buoy: gentle pulse always, ripples after tapping Buoy
    if (nb) { const t = (now - buoyFx) / 3000, pl = (now % 1400) / 1400; ctx.save(); ctx.strokeStyle = G.players[me].color; ctx.lineWidth = 3;
      ctx.globalAlpha = .7 * (1 - pl); circle(nb[1], nb[2], 22 + 14 * pl); ctx.stroke();
      if (t >= 0 && t < 1) for (let k = 0; k < 3; k++) { const ph = ((now - buoyFx) / 1000 + k / 3) % 1; ctx.globalAlpha = (1 - ph) * (1 - t * .5); ctx.lineWidth = 4; circle(nb[1], nb[2], 20 + 80 * ph); ctx.stroke(); }
      ctx.restore(); } }
  { const a = G.buoys.find(b => b[0] === s.ships[me].n + 1), b2 = G.buoys.find(b => b[0] === s.ships[me].n + 2), gap = 12 / sc;
    // faint dotted guide lines: from my ship to the next buoy, and from the next buoy on to the one after it (fading out)
    if (a && !s.ships[me].dead) { const sh = I.ships[me], dx = a[1] - sh.x, dy = a[2] - sh.y, d = Math.hypot(dx, dy); ctx.save(); ctx.fillStyle = G.players[me].color; ctx.globalAlpha = .3;
      for (let u = 45; u < d - 30; u += gap) { circle(sh.x + dx * u / d, sh.y + dy * u / d, 2.2 / sc); ctx.fill(); } ctx.restore(); }
    if (a && b2) { const dx = b2[1] - a[1], dy = b2[2] - a[2], d = Math.hypot(dx, dy); ctx.save(); ctx.fillStyle = G.players[me].color;
      for (let u = 30; u < d - 30; u += gap) { const t = u / d; ctx.globalAlpha = .4 * (1 - t); circle(a[1] + dx * t, a[2] + dy * t, 2.2 / sc); ctx.fill(); } ctx.restore(); } }
  { const nb2 = G.buoys.find(b => b[0] === s.ships[me].n + 2); // weaker, slower ping for the buoy after the next
    if (nb2) { const pl = ((now + 700) % 2000) / 2000; ctx.save(); ctx.strokeStyle = G.players[me].color; ctx.lineWidth = 2; ctx.globalAlpha = .3 * (1 - pl); circle(nb2[1], nb2[2], 20 + 10 * pl); ctx.stroke(); ctx.restore(); } }
  // flames
  fx.filter(f => f.e === 'fire').forEach(f => { const sh = I.ships[f.i], len = Math.hypot(f.x, f.y), al = 1 - (now - f.at) / 700, d = Math.atan2(f.y, f.x) + Math.PI;
    const g = ctx.createLinearGradient(sh.x, sh.y, sh.x + Math.cos(d) * (60 + len), sh.y + Math.sin(d) * (60 + len)); g.addColorStop(0, 'rgba(255,255,255,' + al + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.arc(sh.x, sh.y, 60 + len, d - .25, d + .25); ctx.closePath(); ctx.fill(); });
  // ships
  I.ships.forEach((sh, i) => { if (sh.dead) return; const p = G.players[i], hit = fx.some(f => f.e === 'hit' && f.i === i && now - f.at < 300);
    ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(sh.a); poly(G.ship.map(q => [q[0] - 18, q[1] - 15]), true);
    ctx.globalAlpha = sh.inv && Math.floor(now / 150) % 2 ? .4 : 1; ctx.fillStyle = '#000'; ctx.strokeStyle = hit ? '#f55' : '#fff'; ctx.lineWidth = 2; ctx.shadowColor = hit ? '#f33' : p.color; ctx.shadowBlur = 20; ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = p.color; ctx.font = '20px Optima,sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.name, sh.x, sh.y - 40);
    ctx.save(); ctx.fillStyle = sh.hp < 30 ? '#f55' : p.color; ctx.fillRect(sh.x - 25, sh.y - 30, 50 * sh.hp / 100, 4); ctx.restore(); ctx.strokeStyle = p.color; ctx.lineWidth = 1; ctx.strokeRect(sh.x - 25, sh.y - 30, 50, 4);
    for (let j = 0; j < G.nb; j++) { circle(sh.x - 25 + j * 12.5 + 3, sh.y - 20, 3); j < sh.n ? ctx.fill() : ctx.stroke(); } });
  fx.forEach(f => { const t = (now - f.at) / (f.e === 'boom' ? 1500 : 700); // explosions and respawn rings
    if (f.e === 'boom' && t < 1) { ctx.save(); ctx.globalAlpha = Math.max(0, 1 - t); ctx.fillStyle = '#fff'; if (t < .15) { circle(f.x, f.y, 60 * (1 - t / .15) + 20); ctx.fill(); }
      ctx.strokeStyle = G.players[f.i].color; ctx.lineWidth = 4; circle(f.x, f.y, 20 + 140 * t); ctx.stroke();
      for (let k = 0; k < 16; k++) { const an = k * Math.PI / 8 + (k % 3) * .2, sp = 60 + (k * 37 % 100); circle(f.x + Math.cos(an) * sp * t * 2, f.y + Math.sin(an) * sp * t * 2, 4 * (1 - t) + 1); ctx.fill(); } ctx.restore(); }
    if (f.e === 'respawn' && t < 1) { ctx.save(); ctx.globalAlpha = t; ctx.strokeStyle = G.players[f.i].color; ctx.lineWidth = 4; circle(f.x, f.y, 100 * (1 - t) + 10); ctx.stroke(); ctx.restore(); } });
  if (pfc.fx) fx.forEach(f => pfc.fx(f, now));
  if (wc.fx) fx.forEach(f => wc.fx(f, now)); // the weapon's own effects and projectiles
  if (wc.draw) wc.draw(G, I, now);
  if (armed && G.weapon && !s.ships[me].dead) { // aiming: the weapon's range around me, and a ring on every ship that can be tapped
    const mine = I.ships[me], pulse = 3 * Math.sin(now / 150); ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5, 1.5 / sc);
    if (G.wrange) { ctx.globalAlpha = .35; ctx.setLineDash([10 / sc, 10 / sc]); circle(mine.x, mine.y, G.wrange); ctx.stroke(); ctx.setLineDash([]); }
    I.ships.forEach((sh, i) => { if (i === me || sh.dead) return; ctx.globalAlpha = !G.wrange || Math.hypot(sh.x - mine.x, sh.y - mine.y) <= G.wrange ? .95 : .3; circle(sh.x, sh.y, Math.max(32, 24 / sc) + pulse); ctx.stroke(); });
    ctx.restore(); }
  // my plan
  if (!s.ships[me].dead && !over) {
    const P = plan(), col = G.players[me].color, sh = I.ships[me];
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = 1; poly(P.path); ctx.stroke();
    P.C.forEach((f, i) => { const tip = P.H[i], open = i === FREE;
      ctx.globalAlpha = open ? .5 : .25; ctx.fillStyle = P.crashStep !== null && i >= P.crashStep ? '#f33' : col; circle(f[0], f[1], P.pw * P.tf[i]); ctx.fill();
      ctx.globalAlpha = 1; ctx.lineWidth = open ? 3 : 1.5;
      circle(tip[0], tip[1], open ? 14 : 8); open ? ctx.fill() : ctx.stroke();
      if (open) { const left = Math.max(0, (P.tickH - (now + clock.off) / 1000 - .12) / G.step); ctx.beginPath(); ctx.arc(tip[0], tip[1], 24, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * left); ctx.stroke(); } });
    ctx.globalAlpha = 1;
  }
}
requestAnimationFrame(frame);
setInterval(() => { if (!G || !snaps.length) return; const s = latest();
  $('hud').innerHTML = G.players.map((p, i) => p.dummy ? `<span style="color:${p.color}">${p.name}</span>: practice target, hull ${s.ships[i].hp}%${s.ships[i].dead ? ' - destroyed, back soon' : ''}` : `<span style="color:${p.color}">${p.name}${i === me ? ' (you)' : ''}</span>: ${s.ships[i].n}/${G.nb}, hull ${s.ships[i].hp}%${s.ships[i].dead ? ' - DESTROYED, back in ' + Math.ceil(s.ships[i].rs) + 's' : ''}` + (s.pw[i] > 100 ? `, underdog +${Math.round(s.pw[i] - 100)}%` : '')).join('<br>') + (iAmHost ? '<br><small>you are the host: keep this tab visible</small>' : '') + (PFC().hud ? PFC().hud(G) : '') + (G.weapon ? '<br><small>Weapon: ' + weaponLabel(G.weapon) + '</small>' : '') + '<br><small>' + VERSION + '</small>';
  const fb = $('bfire'); fb.style.display = G.weapon ? '' : 'none';
  if (G.weapon) { const cd = Math.max(0, s.ships[me].cd - (performance.now() - s.at) / 1000); fb.disabled = (cd > 0 && !armed && !(WC().canDetonate && WC().canDetonate(s, me))) || s.ships[me].dead || !!over; fb.className = armed ? 'armed' : '';
    const wc = WC(); fb.textContent = wc.canDetonate && wc.canDetonate(s, me) ? 'Detonate' : armed ? 'Tap a target (tap here to cancel)' : cd > 0 ? weaponLabel(G.weapon) + ' ' + cd.toFixed(1) + ' s' : (G.targeted ? 'Aim ' : ((typeof wc.verb === 'function' ? wc.verb(s, me) : wc.verb) || 'Fire') + ' ') + weaponLabel(G.weapon); }
  }, 200);
