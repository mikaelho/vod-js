// Unit tests of the relay without Cloudflare: room-core.mjs (id takeover, silent connections, hibernation restore) and worker.js (secret check, /check).
// Run from the project folder: node tools/relay-core-test.mjs
import { RoomCore, PROTOCOL } from '../relay/room-core.mjs';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const sock = () => { const w = { got: [], closed: null, send(t) { w.got.push(JSON.parse(t)); }, close(code, why) { w.closed = code || 1000; } }; return w; };
let t = 1000; const core = new RoomCore({ staleMs: 70000, now: () => t }), say = (w, o) => core.message(w, JSON.stringify(o)), last = w => w.got[w.got.length - 1];
const a = sock(); core.attach(a); say(a, { t: 'hi', id: 'host', tok: 'tokentoken1' });
ok(last(a).t === 'ok' && last(a).protocol === PROTOCOL, 'registers and tells the protocol version');
const b = sock(); core.attach(b); say(b, { t: 'hi', id: 'host' }); ok(last(b).type === 'unavailable-id' && b.closed, 'a live id cannot be taken without its token');
const c = sock(); core.attach(c); say(c, { t: 'hi', id: 'host', tok: 'otherother1' }); ok(last(c).type === 'unavailable-id', '... nor with a wrong token');
const d = sock(); core.attach(d); say(d, { t: 'hi', id: 'host', tok: 'tokentoken1' }); ok(last(d).t === 'ok' && a.closed === 4000 && core.byId.get('host') === d, 'the same token takes the id over at once and closes the old connection');
const e = sock(); core.attach(e); say(e, { t: 'hi', id: 'joiner' }); say(e, { t: 'to', to: 'host', d: { x: 1 } }); ok(last(d).t === 'from' && last(d).d.x === 1, 'messages go to the new connection');
t += 71000; const f = sock(); core.attach(f); say(f, { t: 'hi', id: 'joiner' }); ok(last(f).t === 'ok' && e.closed === 4000, 'an id whose connection has been silent for 70 s can be taken without a token');
const g = sock(); core.attach(g); say(g, { t: 'hi', id: 'pinger', tok: 'pingping12' }); t += 60000; say(g, { t: 'ping' }); t += 20000; const h = sock(); core.attach(h); say(h, { t: 'hi', id: 'pinger' });
ok(last(h).type === 'unavailable-id', 'pings keep a connection alive');
// lastSeen hook (Cloudflare answers pings itself): a fresh automatic pong keeps it alive; after hibernation the wake-up time does not count as activity
const core2 = new RoomCore({ now: () => t, hooks: { lastSeen: w => w.pong || 0 } }), x = sock(); core2.restore(x, { id: 'old', tok: 'abcdefgh12', seen: t - 100000 });
const y = sock(); core2.attach(y); core2.message(y, JSON.stringify({ t: 'hi', id: 'old' })); ok(last(y).t === 'ok' && x.closed === 4000, 'restored after hibernation: a silent connection does not block its id');
const z = sock(); core2.restore(z, { id: 'live', seen: t - 100000 }); z.pong = t - 3000; const w2 = sock(); core2.attach(w2); core2.message(w2, JSON.stringify({ t: 'hi', id: 'live' }));
ok(last(w2).type === 'unavailable-id', 'restored: a connection with recent automatic pongs keeps its id');
// worker.js front door (no Durable Object needed for these)
globalThis.WebSocketPair = class {}; globalThis.WebSocketRequestResponsePair = class {};
const W = (await import('../relay/worker.js')).default, env = { RELAY_SECRET: 'sé cret' }, b64 = s => Buffer.from(s).toString('base64url');
const chk = async (k, en = env) => (await W.fetch(new Request('https://r.example/check', { headers: k == null ? {} : { 'X-Relay-Key': k } }), en)).json();
ok((await chk(b64('sé cret'))).key === 'ok' && (await chk(b64('nope'))).key === 'wrong' && (await chk(null)).key === 'missing' && (await chk('x', {})).key === 'not-set', '/check tells a right, wrong, missing and unset secret apart');
ok((await chk(b64('sé cret'))).protocol === PROTOCOL && (await chk(null)).service === 'vod-relay', '/check reports the service and protocol');
const r = await W.fetch(new Request('https://r.example/room1', { headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': 'vodjs-relay, k.' + b64('wrong') } }), env); ok(r.status === 403, 'a WebSocket with the wrong secret is refused');
console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
