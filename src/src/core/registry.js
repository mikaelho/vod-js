// VoD registry: shared constants, small helpers, and the three plug-in lists (ships, playfields, weapons). See src/README.md.
// A module file calls VOD.ship(id, def), VOD.playfield(id, def) or VOD.weapon(id, def); build.py includes every file in those folders, nothing else to edit.
(function () {
  var VOD = globalThis.VOD = { K: {}, u: {}, ships: {}, playfields: {}, weapons: {} };
  VOD.K = { S: 30, STEP: 3, W: 2100, H: 1300, CELL: 100, NB: 5, POWER: 100, WEAPON_CD: 4, FIX: 1 / 60, COLORS: ['cyan', 'magenta', 'lightgreen', 'yellow', 'orange'] };
  // S: pixels per physics metre. STEP: seconds between thrust locks (the "tick"). W, H: default playfield size. FIX: physics step.
  VOD.u = {
    mulberry: function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }, // seeded random numbers
    rnd: function (a, b) { return a + Math.random() * (b - a); },
    pick: function (arr) { return arr.splice(Math.floor(Math.random() * arr.length), 1)[0]; }, // removes and returns a random element
    hull: function (p) { // convex hull (monotone chain)
      p = p.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
      var cr = function (o, a, b) { return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]); }, lo = [], up = [], i;
      for (i = 0; i < p.length; i++) { while (lo.length > 1 && cr(lo[lo.length-2], lo[lo.length-1], p[i]) <= 0) lo.pop(); lo.push(p[i]); }
      for (i = p.length - 1; i >= 0; i--) { while (up.length > 1 && cr(up[up.length-2], up[up.length-1], p[i]) <= 0) up.pop(); up.push(p[i]); }
      lo.pop(); up.pop(); return lo.concat(up);
    }
  };
  var reg = function (kind) { return function (id, def) { def.id = id; def.order = def.order || 50; VOD[kind][id] = def; return def; }; };
  VOD.ship = reg('ships'); VOD.playfield = reg('playfields'); VOD.weapon = reg('weapons');
  VOD.list = function (kind) { return Object.keys(VOD[kind]).map(function (k) { return VOD[kind][k]; }).sort(function (a, b) { return a.order - b.order || (a.id < b.id ? -1 : 1); }); };
})();
