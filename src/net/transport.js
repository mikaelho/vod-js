// Connection layer. Three interchangeable transports with the small PeerJS-like interface the lobby uses:
//   new T(id)  .id  .on('open' | 'error' | 'connection' | 'disconnected')  .connect(id) -> conn  .destroy()
//   conn: .on('open' | 'data')  .send(message)
// - (PeerJS, direct WebRTC, was tried earlier and dropped: it failed on some browsers and networks)
// - LocalPeer: tabs of one browser, through BroadcastChannel
// - RelayPeer: WebSocket relay (relay/worker.js on Cloudflare); needs the relay address and secret in the page address
// Messages are plain JSON-able objects. Adding another transport means adding another class like these.

// Same-browser transport (tabs of this page, through BroadcastChannel) with the small part of the PeerJS interface used here. Used when online play is unavailable.
class LocalConn {
  constructor(p, remote, cid) { this.p = p; this.peer = remote; this.cid = cid; this.h = {}; }
  on(e, f) { (this.h[e] = this.h[e] || []).push(f); return this; }
  emit(e, ...a) { (this.h[e] || []).slice().forEach(f => f(...a)); }
  send(d) { this.p.bc.postMessage({ t: 'data', to: this.peer, cid: this.cid, d }); }
  close() {}
}
class LocalPeer {
  constructor(id) {
    this.h = {}; this.conns = {}; this.up = false; this.id = id || 'l' + Math.random().toString(36).slice(2, 9);
    this.bc = new BroadcastChannel('vodjs-local'); this.bc.onmessage = e => this.recv(e.data); this.bc.postMessage({ t: 'who', id: this.id });
    this.timer = setTimeout(() => { this.up = true; this.emit('open', this.id); }, 250);
  }
  on(e, f) { (this.h[e] = this.h[e] || []).push(f); return this; }
  emit(e, ...a) { (this.h[e] || []).slice().forEach(f => f(...a)); }
  recv(m) {
    if (m.t === 'who' && this.up && m.id === this.id) this.bc.postMessage({ t: 'taken', id: m.id });
    else if (m.t === 'taken' && !this.up && m.id === this.id) { clearTimeout(this.timer); this.emit('error', { type: 'unavailable-id' }); }
    else if (m.t === 'connect' && this.up && m.to === this.id) { const c = new LocalConn(this, m.from, m.cid); this.conns[m.cid] = c; this.bc.postMessage({ t: 'accept', to: m.from, cid: m.cid }); this.emit('connection', c); setTimeout(() => c.emit('open'), 0); }
    else if (m.t === 'accept' && m.to === this.id && this.conns[m.cid]) { clearTimeout(this.conns[m.cid].timer); setTimeout(() => this.conns[m.cid].emit('open'), 0); }
    else if (m.t === 'data' && m.to === this.id && this.conns[m.cid]) this.conns[m.cid].emit('data', m.d);
  }
  connect(to) { const cid = Math.random().toString(36).slice(2), c = new LocalConn(this, to, cid); this.conns[cid] = c; c.timer = setTimeout(() => this.emit('error', { type: 'peer-unavailable' }), 700); this.bc.postMessage({ t: 'connect', to, from: this.id, cid }); return c; }
  destroy() { clearTimeout(this.timer); try { this.bc.close(); } catch (_) {} }
}

const b64url = x => btoa(String.fromCharCode(...new TextEncoder().encode(x))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); // any secret fits in a WebSocket subprotocol this way
// ?relay=ADDRESS and #key=SECRET (the part after # never leaves the browser; ?key= also works). null when not configured.
function relayConfig() {
  const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.slice(1));
  let a = (q.get('relay') || '').trim().replace(/\/+$/, ''); const key = h.get('key') || q.get('key') || '';
  if (!a || !key) return null;
  const base = /^https:/.test(a) ? a.replace(/^https:/, 'wss:') : /^http:/.test(a) ? a.replace(/^http:/, 'ws:') : /^wss?:/.test(a) ? a : 'wss://' + a;
  return { base, key, host: base.replace(/^wss?:\/\//, '') };
}
const RELAY_PROTOCOL = 2; // the relay protocol this page speaks (PROTOCOL in relay/room-core.mjs); an older relay still works, without the extras
const GIVE_UP = 90000;    // ms of trying to get the relay back before the page says the connection is lost
const PING_EVERY = 5000;  // keepalive; the relay answers it without waking up
const DEAD_AFTER = 15000; // nothing heard this long while the page is visible: the connection is dead even if the browser thinks it is open
const PROBE_WAIT = 4000;  // after waking up (tab visible, focus, network back): ping, and reconnect unless something arrives this soon
const STALE_ACTION = 3000; // a fire / detonate request that had to wait for the connection longer than this is dropped rather than sent late
class RelayConn {
  constructor(p, remote, cid) { this.p = p; this.peer = remote; this.cid = cid; this.h = {}; }
  on(e, f) { (this.h[e] = this.h[e] || []).push(f); return this; }
  emit(e, ...a) { (this.h[e] || []).slice().forEach(f => f(...a)); }
  send(d) { this.p.send(this.peer, { t: 'data', cid: this.cid, d }); }
  close() {}
}
class RelayPeer {
  // Resilient: the WebSocket is opened again whenever it drops (same peer id, so the logical connections carry on), with backoff and some jitter. A private resume token lets
  // the relay hand the id over to the new connection at once, even if it has not yet noticed the old one die. Messages sent meanwhile wait in a queue (snapshots are not
  // queued, and fire / detonate requests that waited too long are dropped). A dead socket that still looks open is found by missing replies to the pings, and when the tab
  // wakes up a ping checks the connection at once. When connecting keeps failing, the relay's /check explains why in plain words ('problem' event).
  // Events: 'open' (first registration), 'reconnecting', 'reconnected', 'disconnected' (gave up after GIVE_UP ms), 'problem' (text), 'error'.
  constructor(id, cfg) { // cfg: { base, key, room }
    this.h = {}; this.conns = {}; this.up = false; this.everUp = false; this.failed = false; this.closed = false; this.cfg = cfg; this.q = []; this.tries = 0; this.lostAt = 0; this.lastRx = Date.now(); this.flagged = false;
    this.id = id || 'r' + Math.random().toString(36).slice(2, 9);
    this.tok = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 20); // only this page knows it
    this.protocol = 0; this.open();
    this.ka = setInterval(() => this.watch(), PING_EVERY);
    this.wake = () => { if (this.closed || this.failed || (document.visibilityState && document.visibilityState !== 'visible')) return;
      if (this.up) this.probe(); else if (!this.ws || this.ws.readyState > 1 || this.wait) { clearTimeout(this.rt); this.wait = false; this.open(); } };
    addEventListener('online', this.wake); addEventListener('focus', this.wake); document.addEventListener('visibilitychange', this.wake);
  }
  on(e, f) { (this.h[e] = this.h[e] || []).push(f); return this; }
  emit(e, ...a) { (this.h[e] || []).slice().forEach(f => f(...a)); }
  open() {
    if (this.closed || this.failed) return; this.wait = false; let ws;
    try { ws = this.ws = new WebSocket(this.cfg.base + '/' + this.cfg.room, ['vodjs-relay', 'k.' + b64url(this.cfg.key)]); } catch (_) { this.lost(); return; }
    clearTimeout(this.at); this.at = setTimeout(() => { if (this.ws === ws && !this.up) this.drop(ws); }, 6000); // an attempt that never registers is dropped and retried
    ws.onopen = () => { try { ws.send(JSON.stringify({ t: 'hi', id: this.id, tok: this.tok })); } catch (_) {} };
    ws.onmessage = e => { this.lastRx = Date.now(); let m; try { m = JSON.parse(e.data); } catch (_) { return; } this.recv(m); };
    ws.onclose = () => { if (this.ws === ws) this.lost(); };
  }
  drop(ws) { ws.onclose = null; try { ws.close(); } catch (_) {} if (this.ws === ws) this.lost(); }
  lost() { // the socket closed, or never worked: try again unless we are out of patience
    clearTimeout(this.at); if (this.closed || this.failed) return;
    this.up = false; this.tries++;
    if (this.tries === 2) this.diagnose();
    if (!this.everUp) { if (this.tries >= 3) { this.failed = true; this.diagnose().then(problem => this.emit('error', { type: 'relay-refused', problem })); return; } }
    else { if (!this.lostAt) this.lostAt = Date.now(); if (!this.flagged) { this.flagged = true; this.emit('reconnecting'); }
      if (Date.now() - this.lostAt > GIVE_UP) { this.failed = true; this.emit('disconnected'); return; } }
    const delay = Math.min(5000, 400 * Math.pow(2, Math.min(this.tries - 1, 4))) + Math.random() * 400; this.wait = true; clearTimeout(this.rt); this.rt = setTimeout(() => this.open(), delay);
  }
  watch() { // every PING_EVERY: ping, and (while the page is visible; hidden tabs have throttled timers) treat a relay silent for DEAD_AFTER as gone
    if (!this.up || this.closed) return;
    const visible = !document.visibilityState || document.visibilityState === 'visible';
    if (visible && Date.now() - this.lastRx > DEAD_AFTER) { this.drop(this.ws); return; }
    this.ping();
  }
  ping() { if (this.ws && this.ws.readyState === 1) { try { this.ws.send('{"t":"ping"}'); } catch (_) {} } } // exactly this text: the relay answers it without waking up
  probe() { // is the connection really alive? ping, and reconnect unless something arrives soon
    if (!this.up || this.probing) return; const since = Date.now(), ws = this.ws; this.probing = true; this.ping();
    setTimeout(() => { this.probing = false; if (this.ws === ws && this.up && this.lastRx < since) this.drop(ws); }, PROBE_WAIT);
  }
  async diagnose() { // why does connecting fail? in words a player can act on (needs a relay with /check; protocol 2)
    if (this.diag) return this.diag;
    this.diag = (async () => {
      const http = this.cfg.base.replace(/^ws/, 'http'); let problem;
      if (location.protocol === 'https:' && this.cfg.base.startsWith('ws:')) problem = 'this secure page cannot use the insecure relay address ' + this.cfg.host + '; use its https address';
      else if (navigator.onLine === false) problem = 'this device is offline';
      else try {
        const r = await fetch(http + '/check', { headers: { 'X-Relay-Key': b64url(this.cfg.key) }, cache: 'no-store' }); let j = null; try { j = await r.json(); } catch (_) {}
        if (!j || j.service !== 'vod-relay') problem = 'something answers at ' + this.cfg.host + ', but it is not an up-to-date VoD relay: check the relay= part of the address, or redeploy the relay';
        else if (j.key === 'wrong' || j.key === 'missing') problem = 'the relay rejected the secret: check the #key= part of the address';
        else if (j.key === 'not-set') problem = 'the relay has no secret set (wrangler secret put RELAY_SECRET)';
        else if (j.protocol > RELAY_PROTOCOL) problem = 'the relay is newer than this page: reload the page';
        else problem = 'the relay is reachable, but the live connection fails: this network may block WebSockets (try another one, e.g. mobile data)';
      } catch (_) { problem = 'cannot reach the relay at ' + this.cfg.host + ': check the relay= part of the address and the network'; }
      setTimeout(() => { this.diag = null; }, 20000); // look again later if it still fails
      if (!this.up) this.emit('problem', problem); return problem;
    })();
    return this.diag;
  }
  recv(m) {
    if (m.t === 'ok') { const again = this.everUp; this.up = true; this.everUp = true; this.tries = 0; this.lostAt = 0; this.protocol = m.protocol || 1; clearTimeout(this.at);
      if (again) { this.flagged = false; this.flush(); this.emit('reconnected'); } else this.emit('open', this.id); }
    else if (m.t === 'err') {
      if (m.type === 'peer-unavailable') { const c = Object.values(this.conns).find(c => c.timer && c.peer === m.to); if (c) { clearTimeout(c.timer); c.timer = null; this.emit('error', { type: 'peer-unavailable' }); } } // only matters while connecting to someone
      else if (m.type === 'unavailable-id' && (this.everUp || this.tries > 0)) this.drop(this.ws); // our own old socket is probably still registered (an older relay without resume tokens): try again shortly
      else { this.failed = true; this.emit('error', { type: m.type }); } }
    else if (m.t === 'from') this.inner(m.from, m.d);
  }
  inner(from, d) {
    if (!d) return;
    if (d.t === 'connect') { let c = this.conns[d.cid]; const fresh = !c; if (fresh) { c = this.conns[d.cid] = new RelayConn(this, from, d.cid); } this.send(from, { t: 'accept', cid: d.cid }); if (fresh) { this.emit('connection', c); setTimeout(() => c.emit('open'), 0); } } // a repeated connect (a retry) is answered again but not announced twice
    else if (d.t === 'accept' && this.conns[d.cid]) { const c = this.conns[d.cid]; clearTimeout(c.timer); c.timer = null; if (!c.opened) { c.opened = true; setTimeout(() => c.emit('open'), 0); } }
    else if (d.t === 'data' && this.conns[d.cid]) this.conns[d.cid].emit('data', d.d);
  }
  send(to, d) {
    if (this.up && this.ws.readyState === 1) { try { this.ws.send(JSON.stringify({ t: 'to', to, d })); return; } catch (_) {} }
    if (!(d && d.t === 'data' && d.d && d.d.t === 'snap') && this.q.length < 300) this.q.push([to, d, Date.now()]); // everything but snapshots waits for the connection to come back
  }
  flush() { const q = this.q, now = Date.now(); this.q = []; q.forEach(x => { const t = x[1] && x[1].d && x[1].d.t; if ((t === 'fire' || t === 'detonate') && now - x[2] > STALE_ACTION) return; this.send(x[0], x[1]); }); }
  connect(to) {
    const cid = Math.random().toString(36).slice(2), c = new RelayConn(this, to, cid); this.conns[cid] = c;
    c.timer = setTimeout(() => { c.timer = null; this.emit('error', { type: 'peer-unavailable' }); }, 6000);
    this.send(to, { t: 'connect', cid }); return c;
  }
  destroy() { this.closed = true; clearInterval(this.ka); clearTimeout(this.rt); clearTimeout(this.at); removeEventListener('online', this.wake); removeEventListener('focus', this.wake); document.removeEventListener('visibilitychange', this.wake); try { this.ws.close(); } catch (_) {} }
}
