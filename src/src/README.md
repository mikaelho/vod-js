# VoD source layout

Build: `python3 build.py` → `index.html` (the game, one file) and `dist/host.js` (simulation only, for tests). Prints one line.
Test: `node tools/test.js` (simulation), `node tools/browser-test.js` (headless Chrome smoke test, needs playwright). Bump `src/version.js` for each update.

```
shell.html            page markup and styles (build.py appends all scripts at the end of <body>)
src/core/registry.js  VOD.K constants, VOD.u helpers, VOD.ship / playfield / weapon registration
src/core/host.js      generic host simulation (Host class); knows nothing about particular playfields or weapons
src/ships/*.js        one file per ship          \  build.py includes every .js in these folders, sorted by name:
src/playfields/*.js   one file per playfield      > to add one, drop in a new file. No other file needs editing;
src/weapons/*.js      one file per weapon        /  the dialogs list whatever is registered.
src/net/transport.js  relay / same-browser connection
src/client/*.js       dialog + lobby, game state and input, drawing, end screen
```

## A playfield (`VOD.playfield(id, def)`, see src/playfields/classic.js for the smallest)
`label`, `order` (dialog position). `host` (simulation):
- `build(h, names, opts)` required. Create bodies with `h.body(...)`, buoys with `h.addBuoy(n, x, y)` (n = 1..5), ships with `h.placeShips(names, starts, bu1)` (or `h.addShip`).
  Helpers: `h.cornerStarts(corner, bu1, n)`, `h.freeCells(starts, extra)`. State goes in `h.pfs`. Things that can sit on a respawn point go in `h.loose`.
- optional `drag(h, ship)` → `{ v, t }` velocity and thrust factors applied just before each thrust (client twin: `damp(G, x, y, T)`), `before(h)` every physics step (forces; pull `h.projectiles` too), `tick(h)` every 3 s, `init(h)` and `snapshot(h)` return extra fields (arrive as `G.pf` and `snap.pf`).

`client` (all optional, runs in every browser; page globals `ctx`, `sc`, `circle`, `smooth`, `poly`):
`draw(G, I)` background layer, `interp(a, b, L, ang)` → `I.pf`, `accel(G, x, y, T)` acceleration (gravity, pushes) for the route preview, `sound(e, v, T)` and `fx(f, now)` for the playfield's own events, `blocked(G, x, y, R)` red crash circle, `hud(G)` extra HUD html, `opts(urlParams, fresh)` development options.

## A weapon (`VOD.weapon(id, def)`, see src/weapons/gun.js and missile.js)
`label`, `order`, `targeted` (pilot arms it, taps a ship), `range` (aiming circle).
`host`: `fire(h, sh, target)` required, return true or `h.nofire(sh, 'why')`, set `sh.readyAt` for the cooldown; optional `detonate(h, i)`, `tick(h)`, `after(h)`, `init(h)`, `snapshot(h)` (→ `snap.w`).
Helpers: `h.sight(fromBody, toBody, ignore)`, `h.damage(ship, d)`, `h.blast(x, y, {r, dmg, push})`, `h.projectiles` (objects with `.body`, `projectile: true`, optional `hit(h, other)`).
`client`: `sound(e, v, T)` plays a synthesised sound for one host event (`T.tone`, `T.noise`; see src/client/sound.js), `fx(f, now)` draws one host event, `draw(G, I, now)` draws projectiles, `interp(a, b, L)` → `I.w`, `canDetonate(snap, me)` turns the Fire button into Detonate.

## A ship (`VOD.ship(id, def)`, src/ships/standard.js)
`label`, `shape`, `hp`, `power`. Chosen with `opts.ship`; not yet selectable in the dialog.
