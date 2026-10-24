// Playfield "Caves": a start cavern on the left, then a seeded maze with several entrances and loops (route choices), drawn as organic rock walls.
// Tuning (development): add ?corridor=240&loops=30&rough=80&tilt=80&seed=7 to the page address.
(function () {
var K = VOD.K, S = K.S, NB = K.NB, W = K.W, H = K.H, WALL_MASS = 2; // a wall hit hurts like hitting something this heavy (a rock is about 3)

// Cave walls: the maze's straight wall boxes are only a skeleton. Rasterise them, blur (rounds corners and ends), add smooth noise (the jitter), and trace the
// 0.5 contour with marching squares. Returns closed loops as flat [x0, y0, x1, y1, ...] integer arrays. amp < 0.5 keeps walls solid and corridors open.
function simplify(p, tol) { // Douglas-Peucker on an open polyline
  if (p.length < 3) return p;
  var keep = new Uint8Array(p.length), st = [[0, p.length - 1]]; keep[0] = keep[p.length - 1] = 1;
  while (st.length) {
    var s = st.pop(), a = p[s[0]], b = p[s[1]], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, md = -1, mi = -1;
    for (var q = s[0] + 1; q < s[1]; q++) {
      var tt = Math.max(0, Math.min(1, ((p[q][0] - a[0]) * dx + (p[q][1] - a[1]) * dy) / L2)), ex = a[0] + tt * dx - p[q][0], ey = a[1] + tt * dy - p[q][1], d = ex * ex + ey * ey;
      if (d > md) { md = d; mi = q; }
    }
    if (md > tol * tol) { keep[mi] = 1; st.push([s[0], mi], [mi, s[1]]); }
  }
  return p.filter(function (_, q) { return keep[q]; });
}
function caveContours(rects, W, H, t, amp, rng, warp) {
  var g = 6, pad = 6, nx = Math.ceil(W / g) + 1 + 2 * pad, ny = Math.ceil(H / g) + 1 + 2 * pad, i, j, solid0 = new Uint8Array(nx * ny), solid = new Uint8Array(nx * ny);
  for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) { var px = (i - pad) * g, py = (j - pad) * g; if (px < 0 || py < 0 || px > W || py > H) solid0[j * nx + i] = 1; } // outside the field is rock
  rects.forEach(function (r) {
    var i0 = Math.max(0, Math.ceil((r[0] - r[2] / 2) / g) + pad), i1 = Math.min(nx - 1, Math.floor((r[0] + r[2] / 2) / g) + pad), j0 = Math.max(0, Math.ceil((r[1] - r[3] / 2) / g) + pad), j1 = Math.min(ny - 1, Math.floor((r[1] + r[3] / 2) / g) + pad);
    for (var b = j0; b <= j1; b++) for (var a = i0; a <= i1; a++) solid0[b * nx + a] = 1;
  });
  var mkNoise = function (sz) { // smooth value noise in [-1, 1] with features about sz px wide
    var cw = Math.ceil(W / sz) + 3, ch = Math.ceil(H / sz) + 3, a = []; for (var q = 0; q < cw * ch; q++) a.push(rng() * 2 - 1);
    return function (x, y) {
      var fx = x / sz + 1, fy = y / sz + 1, ix = Math.floor(fx), iy = Math.floor(fy), ux = fx - ix, uy = fy - iy; ux = ux * ux * (3 - 2 * ux); uy = uy * uy * (3 - 2 * uy);
      return a[iy * cw + ix] * (1 - ux) * (1 - uy) + a[iy * cw + ix + 1] * ux * (1 - uy) + a[(iy + 1) * cw + ix] * (1 - ux) * uy + a[(iy + 1) * cw + ix + 1] * ux * uy;
    };
  };
  var wx = warp ? mkNoise(360) : null, wy = warp ? mkNoise(360) : null; // a smooth displacement field: it leans and bends the straight walls without breaking a single connection
  for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
    var qx = (i - pad) * g, qy = (j - pad) * g, si = Math.round((warp ? qx + warp * wx(qx, qy) : qx) / g) + pad, sj = Math.round((warp ? qy + warp * wy(qx, qy) : qy) / g) + pad;
    solid[j * nx + i] = si < 0 || sj < 0 || si >= nx || sj >= ny ? 1 : solid0[sj * nx + si];
  }
  var rw = Math.max(1, Math.floor(t / 2 / g)), S2 = nx + 1, I = new Int32Array(S2 * (ny + 1)), F = new Float32Array(nx * ny);
  for (j = 0; j < ny; j++) { var row = 0; for (i = 0; i < nx; i++) { row += solid[j * nx + i]; I[(j + 1) * S2 + i + 1] = I[j * S2 + i + 1] + row; } }
  var n1 = mkNoise(150), n2 = mkNoise(60), noise = function (x, y) { return .65 * n1(x, y) + .35 * n2(x, y); }; // the wobble along the walls
  for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
    var a0 = Math.max(0, i - rw), a1 = Math.min(nx - 1, i + rw), b0 = Math.max(0, j - rw), b1 = Math.min(ny - 1, j + rw);
    var sum = I[(b1 + 1) * S2 + a1 + 1] - I[b0 * S2 + a1 + 1] - I[(b1 + 1) * S2 + a0] + I[b0 * S2 + a0];
    F[j * nx + i] = sum / ((a1 - a0 + 1) * (b1 - b0 + 1)) + (amp ? amp * noise((i - pad) * g, (j - pad) * g) : 0);
  }
  var segs = [], at = {};
  var ep = function (e) { // crossing point on a cell edge: 'h' joins node (i,j)-(i+1,j), 'v' joins (i,j)-(i,j+1)
    var i2 = e[0] === 'h' ? e[1] + 1 : e[1], j2 = e[0] === 'h' ? e[2] : e[2] + 1, f1 = F[e[2] * nx + e[1]], f2 = F[j2 * nx + i2], tt = (.5 - f1) / (f2 - f1);
    return [(e[1] - pad + tt * (i2 - e[1])) * g, (e[2] - pad + tt * (j2 - e[2])) * g];
  };
  var key = function (e) { return e[0] + e[1] + ',' + e[2]; };
  var S = function (e1, e2) { var id = segs.length; segs.push([key(e1), key(e2), ep(e1), ep(e2)]); (at[key(e1)] = at[key(e1)] || []).push(id); (at[key(e2)] = at[key(e2)] || []).push(id); };
  for (j = 0; j < ny - 1; j++) for (i = 0; i < nx - 1; i++) {
    var va = F[j * nx + i] > .5, vb = F[j * nx + i + 1] > .5, vc = F[(j + 1) * nx + i + 1] > .5, vd = F[(j + 1) * nx + i] > .5, idx = (va ? 1 : 0) | (vb ? 2 : 0) | (vc ? 4 : 0) | (vd ? 8 : 0);
    if (idx === 0 || idx === 15) continue;
    var T = ['h', i, j], B = ['h', i, j + 1], L = ['v', i, j], R = ['v', i + 1, j];
    switch (idx) {
      case 1: case 14: S(L, T); break; case 2: case 13: S(T, R); break; case 3: case 12: S(L, R); break;
      case 4: case 11: S(R, B); break; case 6: case 9: S(T, B); break; case 7: case 8: S(L, B); break;
      case 5: case 10: var ctr = (F[j * nx + i] + F[j * nx + i + 1] + F[(j + 1) * nx + i + 1] + F[(j + 1) * nx + i]) / 4 > .5;
        if ((idx === 5) === ctr) { S(T, R); S(L, B); } else { S(L, T); S(R, B); }
    }
  }
  var used = new Uint8Array(segs.length), loops = [];
  for (var s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    var pts = [], cur = s0, k = segs[s0][0];
    while (cur !== null && !used[cur]) {
      used[cur] = 1; var sg = segs[cur], from = sg[0] === k ? 0 : 1; pts.push(from === 0 ? sg[2] : sg[3]); k = from === 0 ? sg[1] : sg[0];
      var nx2 = (at[k] || []).filter(function (id) { return !used[id]; }); cur = nx2.length ? nx2[0] : null;
    }
    pts.push(pts[0]); var sp = simplify(pts, 1.2); sp.pop();
    var per = 0; for (var q = 0; q < sp.length; q++) { var nq = sp[(q + 1) % sp.length]; per += Math.hypot(nq[0] - sp[q][0], nq[1] - sp[q][1]); }
    if (sp.length >= 3 && per > 80) loops.push([].concat.apply([], sp.map(function (p) { return [Math.round(p[0]), Math.round(p[1])]; })));
  }
  return loops;
}

// "Caves" playfield: a start cavern on the left, then a maze with several entrances. Corridor width = opts.corridor (px). A spanning tree guarantees every cell
// is reachable; opts.loops (0..1) then knocks out that share of the remaining walls, so there are alternative routes rather than one hard solution.
function build(host, names, opts) { // note: h and v below are the maze wall arrays
  var self = host, V = host.V, b2 = host.b2, i, j, k;
  var seed = opts.seed != null && opts.seed !== '' && isFinite(+opts.seed) ? +opts.seed : Math.floor(Math.random() * 1e9), rng = VOD.u.mulberry(seed);
  var rint = function (n) { return Math.floor(rng() * n); }, shuffle = function (a) { for (var q = a.length - 1; q > 0; q--) { var r = rint(q + 1), t = a[q]; a[q] = a[r]; a[r] = t; } return a; };
  var c = Math.max(120, Math.min(480, +opts.corridor || 240)), loops = Math.max(0, Math.min(1, opts.loops != null && isFinite(+opts.loops) ? +opts.loops : .2));
  var t = Math.round(Math.max(40, Math.min(70, c * .25))), P = c + t, SW = 700; // t: wall thickness, P: grid pitch, SW: width of the start cavern
  var N = Math.max(4, Math.floor(2700 / P)), M = Math.max(3, Math.floor(1500 / P)), x0 = SW, y0 = t / 2;
  host.W = SW + N * P + t / 2; host.H = M * P + t; host.pfs.seed = seed;
  var v = [], h = []; // v[i][j]: wall on vertical line i beside row j; h[i][j]: wall on horizontal line j under column i
  for (i = 0; i <= N; i++) { v[i] = []; for (j = 0; j < M; j++) v[i][j] = true; }
  for (i = 0; i < N; i++) { h[i] = []; for (j = 0; j <= M; j++) h[i][j] = true; }
  var par = []; for (k = 0; k < N * M; k++) par[k] = k;
  var find = function (a) { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; }, edges = [], left = [];
  for (i = 1; i < N; i++) for (j = 0; j < M; j++) edges.push([0, i, j, i - 1 + j * N, i + j * N]);
  for (i = 0; i < N; i++) for (j = 1; j < M; j++) edges.push([1, i, j, i + (j - 1) * N, i + j * N]);
  shuffle(edges).forEach(function (e) {
    var a = find(e[3]), b = find(e[4]);
    if (a !== b) { par[a] = b; (e[0] ? h : v)[e[1]][e[2]] = false; } else left.push(e);
  });
  left.forEach(function (e) { if (rng() < loops) (e[0] ? h : v)[e[1]][e[2]] = false; }); // the extra openings: route choices
  var rows = []; for (j = 0; j < M; j++) rows.push(j);
  var entrances = shuffle(rows).slice(0, Math.min(M, Math.max(3, Math.round(M * .6), names.length))); entrances.forEach(function (r) { v[0][r] = false; });
  var open = function (u) { var ui = u % N, uj = Math.floor(u / N), o = []; // cells you can walk to from cell u
    if (ui > 0 && !v[ui][uj]) o.push(u - 1); if (ui < N - 1 && !v[ui + 1][uj]) o.push(u + 1); if (uj > 0 && !h[ui][uj]) o.push(u - N); if (uj < M - 1 && !h[ui][uj + 1]) o.push(u + N); return o; };
  var bfs = function (src) { var d = [], q = src.slice(); for (var z = 0; z < N * M; z++) d[z] = -1; src.forEach(function (s0) { d[s0] = 0; });
    while (q.length) { var u = q.shift(); open(u).forEach(function (w) { if (d[w] < 0) { d[w] = d[u] + 1; q.push(w); } }); } return d; };
  var dEnt = bfs(entrances.map(function (r) { return r * N; })), chosen = []; // buoy 1 a few cells in from the entrances, the next ones a good walk from the previous buoy and not near earlier ones
  for (var bn = 0; bn < NB; bn++) {
    var dPrev = bn ? bfs([chosen[bn - 1]]) : dEnt, lo = bn ? 4 : 3, hi = bn ? 9 : 6, cand = [];
    for (var att = 0; att < 7 && !cand.length; att++) for (var u = 0; u < N * M; u++) {
      if (chosen.indexOf(u) >= 0 || dPrev[u] < lo - att || dPrev[u] > hi + att * 2) continue;
      if (chosen.every(function (o) { return Math.hypot(o % N - u % N, Math.floor(o / N) - Math.floor(u / N)) >= 3 - Math.floor(att / 3); })) cand.push(u);
    }
    if (!cand.length) for (var u2 = 0; u2 < N * M; u2++) if (chosen.indexOf(u2) < 0) cand.push(u2);
    chosen.push(cand[rint(cand.length)]);
  }
  chosen.forEach(function (u, n) {
    var bx = x0 + (u % N + .5) * P, by = y0 + (Math.floor(u / N) + .5) * P;
    host.addBuoy(n + 1, bx, by);
  });
  var rects = []; // [centre x, centre y, width, height] in px
  for (i = 0; i <= N; i++) for (j = 0; j < M; j++) if (v[i][j]) rects.push([x0 + i * P, y0 + j * P + P / 2, t, P + t]);
  for (i = 0; i < N; i++) for (j = 0; j <= M; j++) if (h[i][j]) rects.push([x0 + i * P + P / 2, y0 + j * P, P + t, t]);
  rects.push([x0 / 2, y0, x0, t], [x0 / 2, y0 + M * P, x0, t], [t / 2, host.H / 2, t, host.H]); // roof, floor and back wall of the start cavern
  var rough = Math.max(0, Math.min(100, opts.rough != null && isFinite(+opts.rough) ? +opts.rough : 80)) / 100;
  var tilt = Math.max(0, Math.min(100, opts.tilt != null && isFinite(+opts.tilt) ? +opts.tilt : 80)) / 100; // how far walls may lean from vertical and horizontal
  var cave = caveContours(rects, host.W, host.H, t, .38 * rough, rng, Math.min(60, c * .25) * tilt); // organic outlines; rough = 0 gives smooth rounded walls, 100 the most jitter
  var wall = { kind: 'wall', mass: WALL_MASS }, bd = new b2.Dynamics.b2BodyDef(); bd.type = b2.Dynamics.b2Body.b2_staticBody; bd.userData = wall;
  wall.body = host.world.CreateBody(bd);
  cave.forEach(function (lp) { // every outline segment is an edge shape
    for (var q = 0; q < lp.length; q += 2) {
      var nq = (q + 2) % lp.length, x1 = lp[q], y1 = lp[q + 1], x2 = lp[nq], y2 = lp[nq + 1]; if (Math.hypot(x2 - x1, y2 - y1) < .5) continue;
      var fd = new b2.Dynamics.b2FixtureDef(); fd.shape = new b2.Collision.Shapes.b2PolygonShape(); fd.shape.SetAsEdge(new V(x1 / S, y1 / S), new V(x2 / S, y2 / S));
      fd.friction = .2; fd.restitution = .5; wall.body.CreateFixture(fd);
    }
  });
  host.pfs.walls = cave;
  // ships line up in front of the entrances and head straight through them, so nobody starts aimed at a wall
  var segs = []; cave.forEach(function (lp) { for (var q = 0; q < lp.length; q += 2) { var nq = (q + 2) % lp.length; segs.push([lp[q], lp[q + 1], lp[nq], lp[nq + 1]]); } });
  var wallDist = function (x, y) { var best = 1e9; segs.forEach(function (sg) { var dx = sg[2] - sg[0], dy = sg[3] - sg[1], tt = Math.max(0, Math.min(1, ((x - sg[0]) * dx + (y - sg[1]) * dy) / (dx * dx + dy * dy || 1))); best = Math.min(best, Math.hypot(sg[0] + tt * dx - x, sg[1] + tt * dy - y)); }); return best; };
  var clearAlong = function (yy) { var m = 1e9; for (var xx = 260; xx <= x0 + 120; xx += 40) m = Math.min(m, wallDist(xx, yy)); return m; }; // clearance along the whole straight run into the entrance
  var bestY = function (r) { // the widest-open height of entrance row r, so the walls' jitter and tilt cannot put a wall edge in the way
    var cy = y0 + (r + .5) * P, best = cy, bc = -1;
    for (var yy = cy - P / 2 + 20; yy <= cy + P / 2 - 20; yy += 6) { var cl = clearAlong(yy); if (cl > bc + 1 || (Math.abs(cl - bc) <= 1 && Math.abs(yy - cy) < Math.abs(best - cy))) { bc = cl; best = yy; } }
    return best;
  };
  var ent = shuffle(entrances.slice()), placed = [];
  var slot = function (r) { // a free spot in front of entrance r: clear of walls and at least 62 px from the ships placed before it
    var base = bestY(r), offs = [0, 70, -70, 140, -140, 210, -210], pick = null;
    for (var pass = 0; pass < 2 && pick === null; pass++) for (var q = 0; q < offs.length && pick === null; q++) {
      var yy = base + offs[q];
      if (pass === 0 && clearAlong(yy) < 34) continue;
      if (placed.every(function (p) { return Math.abs(p - yy) >= 62; })) pick = yy;
    }
    placed.push(pick === null ? base : pick); return placed[placed.length - 1];
  };
  names.forEach(function (name, q) {
    var sh = self.addShip(q, name, [260, slot(ent[q % ent.length])], [100, 0]);
    sh.body.GetFixtureList().SetRestitution(.5); // bounce less off walls
  });
}

let wallIdx = null;
function nearWall(G, x, y, R) { // is (x, y) within R px (R <= 24) of a cave wall? uses a grid of outline segments, built on first use
  if (!wallIdx || wallIdx.src !== G.pf.walls) {
    const C = 48, grid = {}, segs = [];
    G.pf.walls.forEach(lp => { for (let q = 0; q < lp.length; q += 2) { const n = (q + 2) % lp.length, sg = [lp[q], lp[q + 1], lp[n], lp[n + 1]], id = segs.push(sg) - 1;
      for (let cx = Math.floor((Math.min(sg[0], sg[2]) - 24) / C); cx <= Math.floor((Math.max(sg[0], sg[2]) + 24) / C); cx++) for (let cy = Math.floor((Math.min(sg[1], sg[3]) - 24) / C); cy <= Math.floor((Math.max(sg[1], sg[3]) + 24) / C); cy++) (grid[cx + ',' + cy] = grid[cx + ',' + cy] || []).push(id); } });
    wallIdx = { src: G.pf.walls, C, grid, segs };
  }
  const l = wallIdx.grid[Math.floor(x / wallIdx.C) + ',' + Math.floor(y / wallIdx.C)]; if (!l) return false;
  return l.some(id => { const sg = wallIdx.segs[id], dx = sg[2] - sg[0], dy = sg[3] - sg[1], t = Math.max(0, Math.min(1, ((x - sg[0]) * dx + (y - sg[1]) * dy) / (dx * dx + dy * dy || 1))), ex = sg[0] + t * dx - x, ey = sg[1] + t * dy - y; return ex * ex + ey * ey < R * R; });
}

VOD.playfield('caves', {
  label: 'Caves', order: 30,
  host: {
    build: build,
    init: function (h) { return { walls: h.pfs.walls, seed: h.pfs.seed }; }
  },
  client: {
    blocked: nearWall, // is (x, y) within R px of a wall? the route preview shows a red circle where the plan hits one
    hud: function (G) { return '<br><small>maze seed ' + G.pf.seed + '</small>'; },
    opts: function (q, fresh) { // development parameters from the page address
      const num = k => q.get(k) === null || q.get(k) === '' ? undefined : +q.get(k);
      return { corridor: num('corridor'), loops: num('loops') === undefined ? undefined : Math.max(0, Math.min(100, num('loops'))) / 100, rough: num('rough'), tilt: num('tilt'), seed: fresh ? null : q.get('seed') };
    },
    draw: function (G, I) {
  if (G.pf.walls) { // cave walls: everything outside the free-space outlines is rock (even-odd fill), with a glowing edge
    const trace = () => { ctx.beginPath(); G.pf.walls.forEach(lp => { for (let q = 0; q < lp.length; q += 2) q ? ctx.lineTo(lp[q], lp[q + 1]) : ctx.moveTo(lp[q], lp[q + 1]); ctx.closePath(); }); };
    ctx.save(); ctx.lineJoin = 'round'; trace(); ctx.strokeStyle = '#cfe'; ctx.lineWidth = 8; ctx.shadowColor = '#8ab'; ctx.shadowBlur = 25; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.rect(-400, -400, G.W + 800, G.H + 800); ctx.fillStyle = '#05060c'; ctx.fill('evenodd');
    trace(); ctx.strokeStyle = '#e8f4ff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }
    }
  }
});
})();
