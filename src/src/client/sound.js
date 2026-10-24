// ---------- sound: every effect is synthesised with Web Audio (no audio files) ----------
// sfx(e) is called with each host event. Core events are handled below; weapon events by the weapon's client.sound(e, v, T) (v: volume 0..1 by distance, T: { tone, noise }).
const SND = { ctx: null, master: null, on: true, last: {}, noise: null };
try { SND.on = localStorage.getItem('vodSound') !== '0'; } catch (_) {}
function sndInit() { // browsers only allow audio after a tap or key press: called from those events
  if (SND.ctx) { if (SND.ctx.state === 'suspended') SND.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  try {
    const c = SND.ctx = new AC(), comp = c.createDynamicsCompressor(); SND.master = c.createGain(); SND.master.gain.value = .8; SND.master.connect(comp); comp.connect(c.destination);
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; SND.noise = buf;
  } catch (_) { SND.ctx = null; }
}
['pointerdown', 'keydown', 'touchstart'].forEach(t => addEventListener(t, sndInit, { passive: true }));
function envelope(g, t, vol, dur, att = .008) { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, vol), t + att); g.gain.exponentialRampToValueAtTime(.0001, t + dur); }
const T = {
  tone(f0, f1, dur, type, vol, delay = 0, att = .008) { // an oscillator gliding from f0 to f1 Hz
    const c = SND.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    envelope(g, t, vol, dur, att); o.connect(g); g.connect(SND.master); o.start(t); o.stop(t + dur + .03);
  },
  noise(dur, kind, f0, f1, vol, delay = 0, att = .008) { // filtered noise ('lowpass' | 'highpass' | 'bandpass') with the filter sweeping from f0 to f1 Hz
    const c = SND.ctx, t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = SND.noise; s.loop = true; f.type = kind; f.Q.value = kind === 'bandpass' ? 2 : .7;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur); envelope(g, t, vol, dur, att); s.connect(f); f.connect(g); g.connect(SND.master); s.start(t, Math.random() * .5); s.stop(t + dur + .03);
  }
};
const CORE_SOUNDS = {
  fire: (e, v) => { const p = .5 + .5 * Math.min(1.2, Math.hypot(e.x, e.y) / 100); T.noise(.42, 'bandpass', 350, 1100, 1.6 * v * p, 0, .1); T.noise(.3, 'lowpass', 700, 200, .9 * v * p, 0, .06); T.tone(110, 70, .35, 'sine', .3 * v * p); }, // a thrust fires: a soft low whoosh that swells in, no bright hiss
  hit: (e, v) => { const k = Math.min(1, (e.d || 10) / 40); T.noise(.2, 'bandpass', 1200, 350, (.5 + .8 * k) * v, 0, .004); T.tone(210, 150, .14, 'sawtooth', (.12 + .2 * k) * v); T.tone(330, 300, .1, 'square', .08 * v); }, // collision or weapon damage
  boom: (e, v) => { T.noise(1.4, 'lowpass', 1800, 120, 1.2 * v, 0, .03); T.tone(80, 45, 1.2, 'sawtooth', .22 * v, 0, .04); T.tone(500, 90, .6, 'sawtooth', .12 * v); }, // a ship destroyed: crack, then a rumble
  blast: (e, v) => { T.noise(.9, 'lowpass', 1800, 90, 1 * v, 0, .02); T.tone(90, 50, .7, 'sawtooth', .2 * v, 0, .03); }, // missile or mine explosion
  respawn: (e, v) => { [330, 440, 660].forEach((f, i) => T.tone(f, f, .2, 'triangle', .4 * v, i * .08)); },
  buoy: (e, v) => { T.tone(880, 880, .4, 'sine', .3 * v); T.tone(1320, 1320, .55, 'sine', .25 * v, .09); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => T.tone(f, f, i === 3 ? 1 : .25, 'triangle', .3, i * .16)); T.tone(262, 262, 1.2, 'sine', .15, .48); }, // the race is over
  nofire: (e, v) => { T.tone(180, 140, .18, 'square', .12 * v, 0, .02); }, // the weapon would not fire
  arm: () => { T.tone(660, 880, .07, 'square', .15); }, disarm: () => { T.tone(660, 440, .07, 'square', .15); }
};
function sfx(e) {
  if (!SND.on || !SND.ctx || SND.ctx.state !== 'running' || !G) return;
  const now = performance.now(); if (now - (SND.last[e.e] || 0) < 40 && e.e !== 'win') return; SND.last[e.e] = now;
  let v = 1; // louder when it concerns me, fainter with distance otherwise
  if (e.i !== me && e.e !== 'win' && e.e !== 'arm' && e.e !== 'disarm' && snaps.length) {
    const s = latest(), mine = s.ships[me], at = e.x != null ? [e.x, e.y] : e.i != null && s.ships[e.i] ? [s.ships[e.i].x, s.ships[e.i].y] : null;
    v = at ? Math.max(.2, Math.min(1, 1 / (1 + Math.hypot(at[0] - mine.x, at[1] - mine.y) / 500))) * .85 : .4;
  }
  if (e.e === 'nofire' && e.i !== me) return;
  try { if (CORE_SOUNDS[e.e]) CORE_SOUNDS[e.e](e, v); else { const wc = WC(), pc = PFC(); if (wc.sound) wc.sound(e, v, T); if (pc.sound) pc.sound(e, v, T); } } catch (_) {}
}
const setSndLabel = () => { $('bsnd').textContent = SND.on ? 'Sound' : 'Muted'; };
$('bsnd').onclick = () => { sndInit(); SND.on = !SND.on; try { localStorage.setItem('vodSound', SND.on ? '1' : '0'); } catch (_) {} setSndLabel(); };
setSndLabel();
