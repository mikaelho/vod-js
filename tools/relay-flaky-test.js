// Resilience test: a local relay (relay/room-core.mjs) that cuts every connection every few seconds, and three browser pages that host, join and start a game anyway.
// Run: NODE_PATH=$(npm root -g) node tools/relay-flaky-test.js   (needs the ws and playwright packages; run `python3 build.py` first)
const path = require('path'), { chromium } = require('playwright'), { WebSocketServer } = require('ws');
(async () => {
  const { RoomCore } = await import(path.join(__dirname, '../relay/room-core.mjs')), rooms = {}, socks = new Set();
  const wss = new WebSocketServer({ port: 8788, handleProtocols: ps => [...ps][0] });
  wss.on('connection', (ws, req) => { const room = rooms[req.url] = rooms[req.url] || new RoomCore(); socks.add(ws); room.attach(ws); ws.on('message', d => room.message(ws, d.toString())); ws.on('close', () => { room.detach(ws); socks.delete(ws); }); });
  let cuts = 0; const cutter = setInterval(() => { socks.forEach(s => s.terminate()); cuts++; }, 3500); // every connection dies every 3.5 s
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1000, height: 650 } }), pages = [], errs = [];
  const url = 'file://' + path.join(__dirname, '../index.html') + '?relay=ws://localhost:8788#key=secret';
  for (let i = 0; i < 3; i++) { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(url); pages.push(p); }
  const [h, j1, j2] = pages; await h.fill('#name', 'Host'); await h.fill('#code', 'flaky'); await h.check('#weaponsOn'); await h.click('#create');
  await h.waitForSelector('#panel', { state: 'visible', timeout: 25000 });
  await j1.fill('#name', 'J1'); await j1.fill('#code', 'flaky'); await j1.click('#join'); await j2.fill('#name', 'J2'); await j2.fill('#code', 'flaky'); await j2.click('#join');
  await h.waitForFunction(() => document.querySelectorAll('#plist li').length === 3, null, { timeout: 40000 });
  await j2.selectOption('#pweapon', 'mine'); await h.waitForTimeout(8000);
  console.log('lobby list on host:', await h.textContent('#plist'), '| after', cuts, 'cuts');
  await h.click('#start');
  for (const p of pages) await p.waitForFunction(() => typeof G !== 'undefined' && G && snaps.length > 5, null, { timeout: 60000 });
  console.log('all three in the game; weapons:', await h.evaluate(() => G.players.map(p => p.weapon).join(',')), '| cuts so far', cuts);
  await h.waitForTimeout(10000); const t0 = await j1.evaluate(() => snaps.length ? latest().ht : 0); await h.waitForTimeout(4000); const t1 = await j1.evaluate(() => latest().ht);
  console.log('game clock still advancing on a joiner after more cuts:', t1 > t0, '(' + t0.toFixed(1) + ' -> ' + t1.toFixed(1) + ')', '| errors', errs);
  clearInterval(cutter); await b.close(); process.exit(t1 > t0 && !errs.length ? 0 : 1);
})();
