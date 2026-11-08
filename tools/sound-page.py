#!/usr/bin/env python3
# Builds sounds.html: every sound effect of the game side by side with alternates, using the game's real sound code (src/client/sound.js and the weapons' / playfields' sound hooks).
# Run from the project folder: python3 tools/sound-page.py   -> sounds.html. Add an alternate by adding an entry to ALT below.
import glob, re
root = __file__.rsplit('/', 2)[0] if '/' in __file__ else '.'
def read(p): return open(root + '/' + p).read()
parts = [read('src/core/registry.js')] + [open(f).read() for f in sorted(glob.glob(root + '/src/weapons/*.js'))] + [open(f).read() for f in sorted(glob.glob(root + '/src/playfields/*.js'))]
snd = read('src/client/sound.js')
page = r"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VoD sounds</title>
<style>
:root{--bg:#0e1013;--card:#171a1f;--line:#2c3138;--tx:#e6e9ec;--mut:#8f969f;--a:#6fd3ff;--b:#ffb86b}
body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.4 system-ui,sans-serif;padding:16px 16px 60px;max-width:900px;margin:auto}
h1{font-size:20px;margin:6px 0 2px} p{color:var(--mut);margin:4px 0 14px} h2{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);margin:26px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}
.bar{position:sticky;top:0;background:var(--bg);padding:8px 0;display:flex;gap:14px;align-items:center;z-index:2;border-bottom:1px solid var(--line)}
.row{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:8px 0;display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:center}
.nm{font-weight:600} .ds{color:var(--mut);font-size:13px} .bt{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
button{font:inherit;border:1px solid var(--a);background:transparent;color:var(--a);padding:7px 12px;border-radius:6px;cursor:pointer} button:hover{background:rgba(111,211,255,.12)}
button.alt{border-color:var(--b);color:var(--b)} button.alt:hover{background:rgba(255,184,107,.12)} button.ab{border-color:var(--line);color:var(--tx)}
@media(max-width:600px){.row{grid-template-columns:1fr}.bt{justify-content:flex-start}}
</style></head><body>
<h1>VoD sound effects</h1><p>Blue = the sound as it is in the game now (this page runs the game's own sound code). Orange = alternates to compare. "A then B" plays both one after the other.</p>
<div class="bar"><label>Volume <input id="vol" type="range" min="0" max="1" step=".05" value=".8"></label><label>Distance <select id="dist"><option value="1">own / near (1.0)</option><option value=".5">far (0.5)</option><option value=".25">very far (0.25)</option></select></label></div>
<div id="list"></div>
<script>
const $ = id => { const e = document.getElementById(id); return e || { style: {}, textContent: '', onclick: null }; };
let G = null, me = 0, snaps = [], latest = () => null, WC = () => ({}), PFC = () => ({}), AW = () => [];
%%GAME%%
%%SND%%
// ---- alternates (from sounds-2.html, "Audio Playground") ----
const out = () => SND.master;
const altEnginePulse = (e, v) => { const c = SND.ctx, now = c.currentTime, osc = c.createOscillator(), gain = c.createGain(); osc.type = 'triangle'; osc.frequency.setValueAtTime(100, now); osc.frequency.exponentialRampToValueAtTime(35, now + .35);
  gain.gain.setValueAtTime(.6 * v, now); gain.gain.exponentialRampToValueAtTime(.1 * v, now + .1); gain.gain.exponentialRampToValueAtTime(.001, now + .4); osc.connect(gain); gain.connect(out()); osc.start(now); osc.stop(now + .4); };
const altLaser = (e, v) => { const c = SND.ctx, now = c.currentTime, osc = c.createOscillator(), gain = c.createGain(); osc.type = 'sine'; osc.frequency.setValueAtTime(1200, now); osc.frequency.exponentialRampToValueAtTime(300, now + .08);
  gain.gain.setValueAtTime(.25 * v, now); gain.gain.exponentialRampToValueAtTime(.001, now + .08); osc.connect(gain); gain.connect(out()); osc.start(now); osc.stop(now + .08); };
const altExplosion = (e, v) => { const c = SND.ctx, now = c.currentTime, dur = .8, src = c.createBufferSource(); src.buffer = SND.noise; src.loop = true;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, now); lp.frequency.exponentialRampToValueAtTime(20, now + dur);
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(8000, now); hp.frequency.exponentialRampToValueAtTime(1000, now + .15);
  const mg = c.createGain(); mg.gain.setValueAtTime(.7 * v, now); mg.gain.exponentialRampToValueAtTime(.001, now + dur); const cg = c.createGain(); cg.gain.setValueAtTime(.3 * v, now); cg.gain.exponentialRampToValueAtTime(.001, now + .15);
  src.connect(lp); lp.connect(mg); mg.connect(out()); src.connect(hp); hp.connect(cg); cg.connect(out()); src.start(now); src.stop(now + dur); };
const altDing = (e, v) => { const c = SND.ctx, now = c.currentTime, o1 = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(); o1.type = o2.type = 'sine'; o1.frequency.value = 587.33; o2.frequency.value = 880;
  g.gain.setValueAtTime(.2 * v, now); g.gain.exponentialRampToValueAtTime(.001, now + .6); o1.connect(g); o2.connect(g); g.connect(out()); o1.start(now); o2.start(now); o1.stop(now + .6); o2.stop(now + .6); };
const wsound = (id, ev) => (e, v) => VOD.weapons[id].client.sound(e, v, T);
const psound = (id) => (e, v) => VOD.playfields[id].client.sound(e, v, T);
// [group, name, when it plays, event, current, alternates: [[label, fn]]]
const ROWS = [
  ['Ship', 'Thrust', 'every 3 s, when a planned thrust fires (louder for bigger thrusts)', { e: 'fire', x: 100, y: 0 }, CORE_SOUNDS.fire, [['Engine pulse', altEnginePulse]]],
  ['Ship', 'Hit', 'collision or weapon damage', { e: 'hit', d: 30 }, CORE_SOUNDS.hit, []],
  ['Ship', 'Destroyed', 'a ship loses all its hull', { e: 'boom' }, CORE_SOUNDS.boom, [['Explosion', altExplosion]]],
  ['Ship', 'Respawn', 'the ship comes back', { e: 'respawn' }, CORE_SOUNDS.respawn, []],
  ['Race', 'Buoy reached', 'you (or somebody near) reach the next buoy', { e: 'buoy' }, CORE_SOUNDS.buoy, [['Milestone ding', altDing]]],
  ['Race', 'Race over', 'a player wins', { e: 'win' }, CORE_SOUNDS.win, []],
  ['Controls', 'Weapon would not fire', 'out of range, no line of sight, ...', { e: 'nofire' }, CORE_SOUNDS.nofire, []],
  ['Controls', 'Arm', 'Fire pressed on a targeted weapon', { e: 'arm' }, CORE_SOUNDS.arm, []],
  ['Controls', 'Disarm', 'Fire pressed again', { e: 'disarm' }, CORE_SOUNDS.disarm, []],
  ['Weapons', 'Explosion (missile / mine)', 'a blast', { e: 'blast' }, CORE_SOUNDS.blast, [['Explosion', altExplosion]]],
  ['Weapons', 'Gun', 'a shot', { e: 'shot' }, wsound('gun'), []],
  ['Weapons', 'Missile launch', '', { e: 'launch' }, wsound('missile'), []],
  ['Weapons', 'Mine dropped', '', { e: 'drop' }, wsound('mine'), []],
  ['Weapons', 'Hammer out', '', { e: 'deploy' }, wsound('hammer'), []],
  ['Weapons', 'Hammer in', '', { e: 'retract' }, wsound('hammer'), []],
  ['Weapons', 'Hammer hit', '', { e: 'bonk' }, wsound('hammer'), []],
  ['Weapons', 'Harpoon', '', { e: 'harpoon' }, wsound('harpoon'), []],
  ['Playfields', 'Pulsar pulse', 'a pulsar fires', { e: 'pulse' }, psound('pulsars'), []],
  ['Playfields', 'Pulse hits a ship', 'a small, reversed pulse', { e: 'pulsehit' }, psound('pulsars'), []],
];
const vol = () => +$('vol').value, dist = () => +$('dist').value;
function play(fn, e) { sndInit(); const go = () => { SND.master.gain.value = vol(); try { fn(e, dist()); } catch (x) { console.error(x); } }; if (SND.ctx.state === 'suspended') SND.ctx.resume().then(go); else go(); }
const list = document.getElementById('list'); let grp = '';
ROWS.forEach(r => {
  if (r[0] !== grp) { grp = r[0]; const h = document.createElement('h2'); h.textContent = grp; list.appendChild(h); }
  const d = document.createElement('div'); d.className = 'row'; d.innerHTML = '<div><div class="nm"></div><div class="ds"></div></div><div class="bt"></div>';
  d.querySelector('.nm').textContent = r[1]; d.querySelector('.ds').textContent = r[2];
  const bt = d.querySelector('.bt'), add = (t, cls, f) => { const b = document.createElement('button'); b.textContent = t; b.className = cls; b.onclick = f; bt.appendChild(b); };
  add('Current', '', () => play(r[4], r[3]));
  r[5].forEach(a => { add(a[0], 'alt', () => play(a[1], r[3])); add('Current, then ' + a[0], 'ab', () => { play(r[4], r[3]); setTimeout(() => play(a[1], r[3]), 1300); }); });
  list.appendChild(d);
});
</script></body></html>"""
page = page.replace('%%GAME%%', '\n'.join(parts)).replace('%%SND%%', snd)
open(root + '/sounds.html', 'w').write(page)
print('wrote sounds.html', len(page) // 1024, 'KB')
