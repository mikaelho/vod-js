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
const GIVE_UP = 90000; // ms of trying to get the relay back before the page says the connection is lost
class RelayConn {
  constructor(p, remote, cid) { this.p = p; this.peer = remote; this.cid = cid; this.h = {}; }
  on(e, f) { (this.h[e] = this.h[e] || []).push(f); return this; }
  emit(e, ...a) { (this.h[e] || []).slice().forEach(f => f(...a)); }
  send(d) { this.p.send(this.peer, { t: 'data', cid: this.cid, d }); }
  close() {}
}
class RelayPeer {
  // Resilient: the WebSocket is opened again whenever it drops (same peer id, so the logical connections carry on), with backoff; messages sent
  // meanwhile wait in a queue (snapshots are not queued: they would be stale); a silent socket is detected by missing replies to the pings.
  // Events: 'open' (first registration), 'reconnecting', 'reconnected', 'disconnected' (gave up after GIVE_UP ms), 'error'.
  constructor(id, cfg) { // cfg: { base, key, room }
    this.h = {}; this.conns = {}; this.up = false; this.everUp = false; this.failed = false; this.closed = false; this.cfg = cfg; this.q = []; this.tries = 0; this.lostAt = 0; this.lastRx = Date.now(); this.flagged = false;
    this.id = id || 'r' + Math.random().toString(36).slice(2, 9);
    this.open();
    this.ka = setInterval(() => this.watch(), 4000);
    this.wake = () => { if (!this.up && !this.closed && !this.failed && (!this.ws || this.ws.readyState > 1 || this.wait)) { clearTimeout(this.rt); this.wait = false; this.open(); } };
    addEventListener('online', this.wake); document.addEventListener('visibilitychange', this.wake);
  }
  on(e, f) { (this.h[e] = this.h[e] || []).push(f); return this; }
  emit(e, ...a) { (this.h[e] || []).slice().forEach(f => f(...a)); }
  open() {
    if (this.closed || this.failed) return; this.wait = false; let ws;
    try { ws = this.ws = new WebSocket(this.cfg.base + '/' + this.cfg.room, ['vodjs-relay', 'k.' + b64url(this.cfg.key)]); } catch (_) { this.lost(); return; }
    clearTimeout(this.at); this.at = setTimeout(() => { if (this.ws === ws && !this.up) { ws.onclose = null; try { ws.close(); } catch (_) {} this.lost(); } }, 6000); // an attempt that never registers is dropped and retried
    ws.onopen = () => { try { ws.send(JSON.stringify({ t: 'hi', id: this.id })); } catch (_) {} };
    ws.onmessage = e => { this.lastRx = Date.now(); let m; try { m = JSON.parse(e.data); } catch (_) { return; } this.recv(m); };
    ws.onclose = () => { if (this.ws === ws) this.lost(); };
  }
  lost() { // the socket closed, or never worked: try again unless we are out of patience
    clearTimeout(this.at); if (this.closed || this.failed) return;
    const was = this.up; this.up = false; this.tries++;
    if (!this.everUp) { if (this.tries >= 3) { this.failed = true; this.emit('error', { type: 'relay-refused' }); return; } }
    else { if (!this.lostAt) this.lostAt = Date.now(); if (!this.flagged) { this.flagged = true; this.emit('reconnecting'); }
      if (Date.now() - this.lostAt > GIVE_UP) { this.failed = true; this.emit('disconnected'); return; } }
    const delay = Math.min(5000, 400 * Math.pow(2, Math.min(this.tries - 1, 4))); this.wait = true; clearTimeout(this.rt); this.rt = setTimeout(() => this.open(), delay);
  }
  watch() { // every 4 s: ping, and treat a relay that has been silent for 20 s as gone
    if (!this.up || this.closed) return;
    if (Date.now() - this.lastRx > 20000) { const ws = this.ws; ws.onclose = null; try { ws.close(); } catch (_) {} this.lost(); return; }
    if (this.ws.readyState === 1) { try { this.ws.send('{"t":"ping"}'); } catch (_) {} }
  }
  recv(m) {
    if (m.t === 'ok') { const again = this.everUp; this.up = true; this.everUp = true; this.tries = 0; this.lostAt = 0; clearTimeout(this.at);
      if (again) { this.flagged = false; this.flush(); this.emit('reconnected'); } else this.emit('open', this.id); }
    else if (m.t === 'err') {
      if (m.type === 'peer-unavailable') { const c = Object.values(this.conns).find(c => c.timer && c.peer === m.to); if (c) { clearTimeout(c.timer); c.timer = null; this.emit('error', { type: 'peer-unavailable' }); } } // only matters while connecting to someone
      else if (m.type === 'unavailable-id' && (this.everUp || this.tries > 0)) { const ws = this.ws; ws.onclose = null; try { ws.close(); } catch (_) {} this.lost(); } // our own earlier socket is probably still registered on the relay: try again shortly
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
    if (!(d && d.t === 'data' && d.d && d.d.t === 'snap') && this.q.length < 300) this.q.push([to, d]); // everything but snapshots waits for the connection to come back
  }
  flush() { const q = this.q; this.q = []; q.forEach(x => this.send(x[0], x[1])); }
  connect(to) {
    const cid = Math.random().toString(36).slice(2), c = new RelayConn(this, to, cid); this.conns[cid] = c;
    c.timer = setTimeout(() => { c.timer = null; this.emit('error', { type: 'peer-unavailable' }); }, 6000);
    this.send(to, { t: 'connect', cid }); return c;
  }
  destroy() { this.closed = true; clearInterval(this.ka); clearTimeout(this.rt); clearTimeout(this.at); removeEventListener('online', this.wake); document.removeEventListener('visibilitychange', this.wake); try { this.ws.close(); } catch (_) {} }
}
