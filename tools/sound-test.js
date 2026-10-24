// Plays every sound effect in headless Chrome and fails on any page error: node tools/sound-test.js
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }), errs = [];
  for (const weapon of ['gun', 'missile', 'mine', 'hammer', 'harpoon']) {
    const p = await b.newPage(); p.on('pageerror', e => errs.push(weapon + ': ' + e.message));
    await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.selectOption('#sweapon', weapon); await p.click('#solo'); await p.waitForTimeout(1500);
    const r = await p.evaluate(async () => { const out = { state: SND.ctx && SND.ctx.state, played: 0, failed: [] };
      for (const e of ['fire', 'hit', 'boom', 'blast', 'respawn', 'buoy', 'win', 'nofire', 'arm', 'disarm', 'shot', 'launch', 'drop', 'deploy', 'retract', 'bonk', 'harpoon']) {
        const ev = { e, i: me, x: 100, y: 100, d: 30 }; try { const wc = WC(), f = CORE_SOUNDS[e] || (wc.sound && ((a, v) => wc.sound(a, v, T))); if (f) { f(ev, 1); out.played++; } } catch (err) { out.failed.push(e + ': ' + err.message); } } // called directly, so errors show (sfx() itself swallows them)
      return out; });
    console.log(weapon, JSON.stringify(r)); if (r.failed.length || r.state !== 'running') errs.push(weapon + ' ' + JSON.stringify(r)); await p.close();
  }
  await b.close(); console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'all sounds ran without errors'); process.exit(errs.length ? 1 : 0);
})();
