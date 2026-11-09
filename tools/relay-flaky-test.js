// Resilience test: a local relay (relay/room-core.mjs, plus worker.js answering /check) that misbehaves, and three browser pages that play through it.
//   1. every connection is cut every 3.5 s while three players host, join, pick weapons and start
//   2. one joiner's connection goes silent without closing (as after a phone sleeps): the page must notice, reconnect and take its id back with its resume token
//   3. a page with the wrong secret must say so in plain words
// Run: NODE_PATH=$(npm root -g) node tools/relay-flaky-test.js   (needs the ws and playwright packages; run `python3 build.py` first)
const path = require('path'), http = require('http'), { chromium } = require('playwright'), { WebSocketServer } = require('ws');
(async () => {
  const { RoomCore } = await import(path.join(__dirname, '../relay/room-core.mjs'));
  globalThis.WebSocketPair = class {}; globalThis.WebSocketRequestResponsePair = class {};
  const W = (await import(path.join(__dirname, '../relay/worker.js'))).default, env = { RELAY_SECRET: 'secret' };
  const rooms = {}, socks = new Set(), frozen = new Set(), log = [];
  const server = http.createServer(async (req, res) => { // /check and friends, through the real worker code
    const r = await W.fetch(new Request('http://localhost:8788' + req.url, { method: req.method, headers: req.headers }), env);
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(await r.text());
  });
  const wss = new WebSocketServer({ server, handleProtocols: ps => [...ps][0] });
  wss.on('connection', (ws, req) => {
    const k = (req.headers['sec-websocket-protocol'] || '').split(',').map(s => s.trim()).find(p => p.startsWith('k.'));
    if (!k || Buffer.from(k.slice(2), 'base64url').toString() !== env.RELAY_SECRET) { ws.close(1008); return; }
    const room = rooms[req.url] = rooms[req.url] || new RoomCore(); socks.add(ws); room.attach(ws);
    const send = ws.send.bind(ws); ws.send = d => { if (!frozen.has(ws)) send(d); }; const close = ws.close.bind(ws); ws.close = (c, why) => { log.push(c + ' ' + why); close(c > 4999 ? 1000 : c); };
    ws.on('message', d => { if (!frozen.has(ws)) room.message(ws, d.toString()); }); ws.on('close', () => { if (frozen.has(ws)) return; room.detach(ws); socks.delete(ws); }); // a frozen socket's end is never noticed: a half-open connection
  });
  await new Promise(r => server.listen(8788, r));
  let cuts = 0, cutter = setInterval(() => { socks.forEach(s => s.terminate()); cuts++; }, 3500); // every connection dies every 3.5 s
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1000, height: 650 } }), pages = [], errs = [];
  const url = 'file://' + path.join(__dirname, '../index.html') + '?relay=ws://localhost:8788#key=secret';
  for (let i = 0; i < 3; i++) { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(url); pages.push(p); }
  const [h, j1, j2] = pages; await h.fill('#name', 'Host'); await h.fill('#code', 'flaky'); await h.check('#weaponsOn'); await h.click('#create');
  await h.waitForSelector('#panel', { state: 'visible', timeout: 25000 });
  await j1.fill('#name', 'J1'); await j1.fill('#code', 'flaky'); await j1.click('#join'); await j2.fill('#name', 'J2'); await j2.fill('#code', 'flaky'); await j2.click('#join');
  await h.waitForFunction(() => document.querySelectorAll('#plist li').length === 3, null, { timeout: 40000 });
  await j2.selectOption('#pweapon', 'mine'); await h.waitForTimeout(8000);
  console.log('1. lobby on the host:', await h.textContent('#plist'), '| after', cuts, 'cuts');
  await h.click('#start');
  for (const p of pages) await p.waitForFunction(() => typeof G !== 'undefined' && G && snaps.length > 5, null, { timeout: 60000 });
  console.log('   all three in the game; weapons:', await h.evaluate(() => G.players.map(p => p.weapon).join(',')), '| cuts so far', cuts);
  clearInterval(cutter);
  // 2. silent death of J1's connection
  await h.waitForTimeout(3000); const j1id = await j1.evaluate(() => peer.id), room = Object.values(rooms)[0], victim = room.byId.get(j1id);
  frozen.add(victim); const t0 = Date.now(), ht0 = await j1.evaluate(() => latest().ht);
  await j1.waitForFunction(h0 => latest().ht > h0 + 2, ht0, { timeout: 40000, polling: 500 }).catch(() => {}); const back = await j1.evaluate(h0 => latest().ht > h0 + 2, ht0);
  console.log('2. silent connection: J1 back in the game:', back, 'after', ((Date.now() - t0) / 1000).toFixed(1), 's; old socket closed by the relay as replaced:', log.some(l => /replaced/.test(l)));
  // 3. wrong secret
  const bad = await ctx.newPage(); await bad.goto('file://' + path.join(__dirname, '../index.html') + '?relay=ws://localhost:8788#key=wrong'); await bad.fill('#code', 'other'); await bad.click('#create');
  await bad.waitForFunction(() => /secret/.test(document.getElementById('msg') ? document.getElementById('msg').textContent : document.body.textContent), null, { timeout: 30000 }).catch(() => {});
  const said = await bad.evaluate(() => (document.getElementById('msg') || document.body).textContent.trim().slice(0, 160)); console.log('3. wrong secret says:', said);
  const okAll = back && log.some(l => /replaced/.test(l)) && /rejected the secret/.test(said) && !errs.length;
  console.log(okAll ? 'all passed' : 'FAILED', errs); await b.close(); server.close(); process.exit(okAll ? 0 : 1);
})();
