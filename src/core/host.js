// VoD host: the generic real-time simulation. Runs only in the host's browser (or Node for tests). Needs the global Box2D (lib/Box2dWeb-2.1.a.3.js).
// It knows nothing about particular playfields or weapons: those plug in through VOD.playfields[id].host and VOD.weapons[id].host (see src/README.md).
(function () {
var K = VOD.K, S = K.S, STEP = K.STEP, W = K.W, H = K.H, NB = K.NB, FIX = K.FIX, COLORS = K.COLORS, hull = VOD.u.hull, pick = VOD.u.pick;

function Host(names, field, opts) {
  opts = opts || {};
  var b2 = Box2D, V = b2.Common.Math.b2Vec2, self = this;
  this.b2 = b2; this.V = V; this.world = new b2.Dynamics.b2World(new V(0, 0), true);
  this.time = 0; this.acc = 0; this.k = 0; this.nextTick = STEP * 2; // the first lock comes after two steps: everyone gets time to plan
  this.leader = 0; this.over = false; this.winner = null; this.events = [];
  this.ships = []; this.buoys = []; this.loose = [];  // loose: things that can sit on a respawn point and must be moved away (rocks)
  this.projectiles = [];                              // anything a weapon launches that gravity should pull on: objects with .body
  this.W = W; this.H = H; this.pfs = {}; this.ws = {}; // pfs / ws: scratch state of the playfield / the weapon
  this.field = VOD.playfields[field] ? field : 'classic'; this.pf = VOD.playfields[this.field].host;
  this.weapon = opts.weapon && VOD.weapons[opts.weapon] ? opts.weapon : null; this.wd = this.weapon ? VOD.weapons[this.weapon] : null; this.wh = this.wd ? this.wd.host : {};
  this.shipDef = VOD.ships[opts.ship] || VOD.ships.standard;

  var L = new b2.Dynamics.b2ContactListener();
  L.BeginContact = function (c) {
    var a = c.GetFixtureA().GetBody().GetUserData(), b = c.GetFixtureB().GetBody().GetUserData();
    if (a.kind === 'ship') self.contact(a, b);
    if (b.kind === 'ship') self.contact(b, a);
    if (a.hit) a.hit(self, b); // projectiles define hit(host, other)
    if (b.hit) b.hit(self, a);
  };
  this.world.SetContactListener(L);
  this.pf.build(this, names, opts); // the playfield creates its obstacles and buoys and places the ships (helpers below)
  this.markDummy(opts);
}

// ---- helpers for playfields and weapons ----
Host.prototype.body = function (obj, x, y, pts, radius, solid) { // solid: 'static' | 'kinematic' | 'dynamic'; without it a circle is a sensor
  var b2 = this.b2, V = this.V, bd = new b2.Dynamics.b2BodyDef();
  bd.type = solid === 'static' ? b2.Dynamics.b2Body.b2_staticBody : solid === 'kinematic' ? b2.Dynamics.b2Body.b2_kinematicBody : b2.Dynamics.b2Body.b2_dynamicBody; bd.position.Set(x / S, y / S); bd.userData = obj;
  var body = this.world.CreateBody(bd), fd = new b2.Dynamics.b2FixtureDef();
  fd.density = 2; fd.friction = 1; fd.restitution = 1;
  if (pts) { fd.shape = new b2.Collision.Shapes.b2PolygonShape(); fd.shape.SetAsArray(pts.map(function (p) { return new V(p[0] / S, p[1] / S); }), pts.length); }
  else { fd.shape = new b2.Collision.Shapes.b2CircleShape(radius / S); fd.isSensor = !solid; body.SetFixedRotation(true); }
  body.CreateFixture(fd); return body;
};
Host.prototype.addShip = function (i, name, s, d) { // d: first-step momentum as a vector in px
  var V = this.V, def = this.shipDef, sh = { kind: 'ship', i: i, name: name, color: COLORS[i % COLORS.length], hp: def.hp, visited: 0, dead: false,
             q: [[0,0],[0,0]], zc: 0, local: def.shape.map(function (p) { return [p[0] - 18, p[1] - 15]; }) };
  sh.start = [s[0], s[1]]; sh.inv = 0; sh.respawnAt = 0; sh.dying = false;
  sh.body = this.body(sh, s[0], s[1], hull(sh.local), 0);
  sh.body.SetAngle(Math.atan2(d[1], d[0])); sh.body.SetAngularDamping(0.5);
  sh.body.SetLinearVelocity(new V(d[0] / (STEP * S), d[1] / (STEP * S)));
  this.ships.push(sh); return sh;
};
Host.prototype.addBuoy = function (n, x, y) { var bu = { kind: 'buoy', n: n, x: x, y: y }; bu.body = this.body(bu, x, y, null, 30); this.buoys.push(bu); return bu; };
// Everyone starts in the same corner, on a circle around buoy 1 (equally far from it), a few degrees apart. Returns the start points.
Host.prototype.cornerStarts = function (corner, bu1, n) {
  var dc = [W / 2 - corner[0], H / 2 - corner[1]], dl = Math.hypot(dc[0], dc[1]), p0 = [corner[0] + dc[0] / dl * 300, corner[1] + dc[1] / dl * 300], starts;
  var R = Math.hypot(p0[0] - bu1[0], p0[1] - bu1[1]), th0 = Math.atan2(p0[1] - bu1[1], p0[0] - bu1[0]);
  for (var sp = 5; sp >= 0; sp--) { // widest spread (5 degrees) that keeps everybody inside the field
    starts = [];
    for (var i = 0; i < n; i++) { var th = th0 + (i - (n - 1) / 2) * sp * Math.PI / 180; starts.push([bu1[0] + R * Math.cos(th), bu1[1] + R * Math.sin(th)]); }
    if (starts.every(function (q) { return q[0] > 40 && q[0] < W - 40 && q[1] > 40 && q[1] < H - 40; })) break;
  }
  return starts;
};
Host.prototype.freeCells = function (starts, extra) { // centres of the grid cells away from the start line (and passing extra(x, y) if given), for rocks and buoys
  var cols = Math.floor(W / K.CELL), rows = Math.floor(H / K.CELL), cx = Math.round(cols / 2) - 1, cy = Math.round(rows / 2) - 1, out = [];
  for (var i = 1; i < cols - 1; i++) for (var j = 1; j < rows - 1; j++) {
    if (i === cx && j === cy) continue; // the middle cell is buoy 1 in the classic field
    var q = [i * K.CELL + K.CELL / 2, j * K.CELL + K.CELL / 2];
    if (starts.every(function (st) { return Math.hypot(q[0] - st[0], q[1] - st[1]) > 150; }) && (!extra || extra(q[0], q[1]))) out.push(q);
  }
  return out;
};
Host.prototype.placeShips = function (names, starts, bu1) { // random order along the start arc, each heading at buoy 1 with the standard first-step momentum
  var order = starts.slice(), self = this;
  names.forEach(function (name, i) { var s = pick(order), d = [bu1[0] - s[0], bu1[1] - s[1]], len = Math.hypot(d[0], d[1]); self.addShip(i, name, s, [d[0] / len * 100, d[1] / len * 100]); });
};
Host.prototype.sight = function (from, to, ignore) { // first solid thing on the straight line between two bodies: { clear: it is `to`, pt: where the line ends }; ignore(userData) skips objects
  var V = this.V, p = from.GetPosition(), q = to.GetPosition(), best = null;
  this.world.RayCast(function (fix, pt, nrm, fr) { var u = fix.GetBody().GetUserData(); if (fix.IsSensor() || fix.GetBody() === from || (ignore && ignore(u))) return 1; if (!best || fr < best.fr) best = { body: fix.GetBody(), pt: pt, fr: fr }; return fr; }, new V(p.x, p.y), new V(q.x, q.y));
  return { clear: !!best && best.body === to, pt: best && best.pt };
};
Host.prototype.nofire = function (sh, why) { this.events.push({ e: 'nofire', i: sh.i, why: why }); return false; };
Host.prototype.damage = function (t, d) { // weapon damage; wrecks and freshly respawned ships are immune
  if (t.dead || this.time < t.inv) return;
  t.hp = Math.max(0, t.hp - d); this.events.push({ e: 'hit', i: t.i, d: Math.round(d) });
  if (t.hp === 0) { t.dead = true; t.dying = true; }
};
// An explosion hurts like a heavy collision: any ship within B.r loses hull (B.dmg at the centre, half of that at the edge), is shoved away (B.push) and loses its planned thrusts.
Host.prototype.blast = function (x, y, B) {
  var V = this.V, self = this;
  this.ships.forEach(function (s) {
    if (s.dead || self.time < s.inv) return;
    var p = s.body.GetPosition(), dx = p.x * S - x, dy = p.y * S - y, d = Math.hypot(dx, dy); if (d > B.r) return;
    var f = 1 - .5 * d / B.r, ux = d > 1 ? dx / d : 1, uy = d > 1 ? dy / d : 0;
    s.q = [[0,0],[0,0]]; s.zc++; s.body.ApplyImpulse(new V(ux * B.push * f, uy * B.push * f), s.body.GetWorldCenter()); self.damage(s, B.dmg * f);
  });
  this.events.push({ e: 'blast', x: Math.round(x), y: Math.round(y), r: B.r });
};

// ---- game rules ----
Host.prototype.power = function (sh) { return this.shipDef.power * (100 + Math.max(0, this.leader - sh.visited) * 25) / 100; };
Host.prototype.markDummy = function (opts) { // solo practice: the last ship is a practice target that stands still and never races
  if (!opts || !opts.dummy) return;
  var d = this.ships[this.ships.length - 1]; d.dummy = true; d.body.SetLinearVelocity(new this.V(0, 0)); d.body.SetLinearDamping(3); d.body.SetAngularDamping(3);
};
Host.prototype.standings = function () { // final results: most buoys first; a tie goes to whoever reached their last buoy earlier
  return this.ships.filter(function (s) { return !s.dummy; }).map(function (s) { return { name: s.name, color: s.color, n: s.visited, t: s.lastAt || 0 }; })
    .sort(function (a, b) { return b.n - a.n || a.t - b.t; });
};

// The pilot fired (for targeted weapons: at ship number `target`); false when nothing happened.
Host.prototype.fire = function (i, target) {
  var sh = this.ships[i];
  if (!sh || !this.wd || this.over || sh.dead || this.time < (sh.readyAt || 0)) return false;
  var t = null;
  if (this.wd.targeted) { t = this.ships[target]; if (!t || t === sh || t.dead) return this.nofire(sh, 'no target'); }
  return this.wh.fire(this, sh, t);
};
Host.prototype.detonate = function (i) { return !!(this.wh.detonate && this.wh.detonate(this, i)); }; // weapons with something in flight (missile, mine)

Host.prototype.contact = function (sh, o) {
  if (this.over || o.projectile) return; // a projectile's damage comes from its own hit() handler
  if (o.kind === 'buoy') {
    if (sh.dummy) return;
    if (o.n === sh.visited + 1) {
      sh.visited++; sh.lastAt = this.time; this.leader = Math.max(this.leader, sh.visited); this.events.push({ e: 'buoy', n: o.n, i: sh.i });
      if (sh.visited === NB) { this.over = true; this.winner = sh.name; this.events.push({ e: 'win', name: sh.name, res: this.standings() }); }
    }
    return;
  }
  sh.q = [[0,0],[0,0]]; sh.zc++; // any impact cancels the planned thrusts; the ship keeps the bounce velocity the collision gave it
  if (sh.dead || this.time < sh.inv) return; // a wreck cannot be hurt, and a fresh respawn is briefly invulnerable
  var a = sh.body.GetLinearVelocity(), c = o.body.GetLinearVelocity(), m = o.body.GetMass() || o.mass || 0, dmg = Math.hypot(a.x - c.x, a.y - c.y) * m * 2;
  if (dmg >= 1) this.events.push({ e: 'hit', i: sh.i, d: Math.round(dmg) });
  sh.hp = Math.max(0, sh.hp - dmg);
  if (sh.hp === 0) { sh.dead = true; sh.dying = true; } // the body is removed after the physics step, not inside the contact callback
};

// After each physics step: blow up ships that just died, bring back ones whose 3 s are up, at the last buoy they passed (or their start).
Host.prototype.after = function () {
  for (var n = 0; n < this.ships.length; n++) {
    var sh = this.ships[n];
    if (sh.dying) {
      sh.dying = false; var p = sh.body.GetPosition(); sh.body.SetActive(false); sh.respawnAt = this.time + 3; sh.q = [[0,0],[0,0]]; sh.zc++;
      this.events.push({ e: 'boom', i: sh.i, x: p.x * S, y: p.y * S });
    } else if (sh.dead && this.time >= sh.respawnAt && !this.over) this.respawn(sh);
  }
  if (this.wh.after) this.wh.after(this);
};
Host.prototype.respawn = function (sh) {
  var V = this.V, b = sh.visited > 0 ? this.buoys[sh.visited - 1] : null, pos = b ? [b.x, b.y] : sh.start;
  this.ships.concat(this.loose).forEach(function (o) { // clear anything sitting on the spawn point
    if (o === sh || o.dead) return;
    var p = o.body.GetPosition(), dx = p.x * S - pos[0], dy = p.y * S - pos[1], d = Math.hypot(dx, dy);
    if (d < 100) { if (d < 1) { dx = 1; dy = 0; d = 1; } o.body.SetPosition(new V((pos[0] + dx / d * 110) / S, (pos[1] + dy / d * 110) / S)); }
  });
  sh.body.SetPositionAndAngle(new V(pos[0] / S, pos[1] / S), sh.body.GetAngle());
  sh.body.SetLinearVelocity(new V(0, 0)); sh.body.SetAngularVelocity(0); sh.body.SetActive(true);
  sh.hp = this.shipDef.hp; sh.dead = false; sh.inv = this.time + 3; sh.q = [[0,0],[0,0]]; sh.zc++;
  this.events.push({ e: 'respawn', i: sh.i, x: pos[0], y: pos[1] });
};

// Client asks to set the vector for the 3rd (furthest) thrust. Accepted only while that slot is still unlocked.
Host.prototype.setThrust = function (i, k, x, y) {
  var sh = this.ships[i];
  if (!sh || this.over || sh.dead || k !== this.k || !isFinite(x) || !isFinite(y)) return false;
  var len = Math.hypot(x, y), max = this.power(sh);
  if (len > max) { x *= max / len; y *= max / len; }
  sh.q[1] = [x, y]; return true;
};

// The ship reaches its first thrust point: fire it, lock the next one, open a new 3rd slot.
Host.prototype.tick = function () {
  var V = this.V, self = this;
  this.ships.forEach(function (sh) {
    var t = sh.q.shift(); sh.q.push([0, 0]);
    var dr = !sh.dead && self.pf.drag ? self.pf.drag(self, sh) : null; // e.g. clouds: { v: velocity factor, t: thrust factor } just before the thrust fires
    if (dr) { if (dr.v !== 1) { var vv = sh.body.GetLinearVelocity(); sh.body.SetLinearVelocity(new V(vv.x * dr.v, vv.y * dr.v)); } t = [t[0] * dr.t, t[1] * dr.t]; }
    if (sh.dead || !(t[0] || t[1])) return;
    var b = sh.body, m = b.GetMass(); b.SetAngle(Math.atan2(t[1], t[0]));
    b.ApplyImpulse(new V(t[0] / (S * STEP) * m, t[1] / (S * STEP) * m), b.GetWorldCenter());
    self.events.push({ e: 'fire', i: sh.i, x: t[0], y: t[1] });
  });
  if (this.pf.tick) this.pf.tick(this);
  if (this.wh.tick) this.wh.tick(this);
  this.k++;
};

Host.prototype.step = function (dt) {
  if (this.over) return;
  this.acc += Math.min(dt, 0.25);
  while (this.acc >= FIX) {
    this.acc -= FIX; if (this.pf.before) this.pf.before(this); if (this.wh.before) this.wh.before(this); this.world.Step(FIX, 8, 3); this.world.ClearForces(); this.time += FIX; this.after();
    if (this.time >= this.nextTick) { this.tick(); this.nextTick += STEP; }
  }
};

Host.prototype.init = function (you) { // sent once to every player: the static description of the game. pf / w hold what the playfield / weapon add.
  var d = this.wd || {};
  return { t: 'init', you: you, field: this.field, W: this.W, H: this.H, weapon: this.weapon, step: STEP, nb: NB, ship: this.shipDef.shape,
    players: this.ships.map(function (s) { return { name: s.name, color: s.color, dummy: !!s.dummy }; }), targeted: !!d.targeted, wrange: d.range || null,
    buoys: this.buoys.map(function (b) { return [b.n, b.x, b.y]; }),
    pf: this.pf.init ? this.pf.init(this) : {}, w: this.wh.init ? this.wh.init(this) : {} };
};

Host.prototype.snapshot = function () { // 20 times a second to every player. pf / w hold what the playfield / weapon add.
  var r1 = function (v) { return Math.round(v * 10) / 10; }, r3 = function (v) { return Math.round(v * 1000) / 1000; }, ev = this.events; this.events = [];
  return { t: 'snap', k: this.k, ht: this.time, tin: Math.round((this.nextTick - this.time) * 1000), ev: ev,
    ships: this.ships.map(function (s) {
      var p = s.body.GetPosition(), v = s.body.GetLinearVelocity();
      return { x: r1(p.x * S), y: r1(p.y * S), a: s.body.GetAngle(), vx: r3(v.x * S), vy: r3(v.y * S),
               hp: Math.round(s.hp), n: s.visited, dead: s.dead, inv: this.time < s.inv, zc: s.zc, cd: Math.max(0, (s.readyAt || 0) - this.time), rs: s.dead ? Math.max(0, s.respawnAt - this.time) : 0, q: s.q.map(function (a) { return a.slice(); }) }; }, this),
    pw: this.ships.map(this.power, this),
    pf: this.pf.snapshot ? this.pf.snapshot(this) : {}, w: this.wh.snapshot ? this.wh.snapshot(this) : {} };
};

VOD.Host = Host;
if (typeof module !== 'undefined') module.exports = Host;
})();
