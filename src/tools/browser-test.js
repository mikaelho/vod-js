// Headless-Chrome smoke test: node tools/browser-test.js  - plays solo on every playfield with every weapon, fails on any page error, saves screenshots to ./shots
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(), errs = []; fs.mkdirSync('shots', { recursive: true });
  for (const field of ['classic', 'planet', 'caves', 'shells', 'clouds', 'pulsars']) for (const weapon of ['none', 'gun', 'missile', 'mine', 'hammer', 'harpoon']) {
    const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
    p.on('pageerror', e => errs.push(field + '/' + weapon + ': ' + e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(field + '/' + weapon + ' console: ' + m.text()));
    await p.goto('file://' + path.resolve(__dirname, '../index.html') + '?seed=4');
    await p.selectOption('#sfield', field); await p.selectOption('#sweapon', weapon); await p.click('#solo'); await p.waitForTimeout(2500);
    if (weapon !== 'none') { await p.click('#bfire'); await p.mouse.click(500, 320); await p.waitForTimeout(300); // arm and tap somewhere; then a drag to move the third thrust
    }
    await p.mouse.move(400, 300); await p.mouse.down(); await p.mouse.move(450, 280, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(1200);
    const hud = await p.textContent('#hud'), btn = await p.textContent('#bfire');
    console.log(field, weapon, '| hud:', hud.replace(/\s+/g, ' ').slice(0, 70), '| button:', btn);
    await p.screenshot({ path: 'shots/' + field + '-' + weapon + '.png' }); await p.close();
  }
  await b.close(); console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors'); process.exit(errs.length ? 1 : 0);
})();
