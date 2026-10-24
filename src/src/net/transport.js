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
class RelayConn {
  constructor(p, remote, cid) { this.p = p; this.peer = remote; this.cid = cid; this.h = {}; }
  on(e, f) { (this.h[e] = this.h[e] || []).push(f); return this; }
  emit(e, ...a) { (this.h[e] || []).slice().forEach(f => f(...a)); }
  send(d) { this.p.send(this.peer, { t: 'data', cid: this.cid, d }); }
  close() {}
}
class RelayPeer {
  constructor(id, cfg) { // cfg: { base, key, room }
    this.h = {}; this.conns = {}; this.up = false; this.failed = false; this.id = id || 'r' + Math.random().toString(36).slice(2, 9);
    this.ws = new WebSocket(cfg.base + '/' + cfg.room, ['vodjs-relay', 'k.' + b64url(cfg.key)]);
    this.ws.onopen = () => this.ws.send(JSON.stringify({ t: 'hi', id: this.id }));
    this.ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } this.recv(m); };
    this.ws.onclose = () => { clearInterval(this.ka); if (this.up) this.emit('disconnected'); else if (!this.failed) this.emit('error', { type: 'relay-refused' }); };
    this.ka = setInterval(() => { if (this.ws.readyState === 1) this.ws.send('{"t":"ping"}'); }, 25000);
  }
  on(e, f) { (this.h[e] = this.h[e] || []).push(f); return this; }
  emit(e, ...a) { (this.h[e] || []).slice().forEach(f => f(...a)); }
  recv(m) {
    if (m.t === 'ok') { this.up = true; this.emit('open', this.id); }
    else if (m.t === 'err') { if (m.type !== 'peer-unavailable') this.failed = true; this.emit('error', { type: m.type }); }
    else if (m.t === 'from') this.inner(m.from, m.d);
  }
  inner(from, d) {
    if (!d) return;
    if (d.t === 'connect') { const c = new RelayConn(this, from, d.cid); this.conns[d.cid] = c; this.send(from, { t: 'accept', cid: d.cid }); this.emit('connection', c); setTimeout(() => c.emit('open'), 0); }
    else if (d.t === 'accept' && this.conns[d.cid]) { clearTimeout(this.conns[d.cid].timer); setTimeout(() => this.conns[d.cid].emit('open'), 0); }
    else if (d.t === 'data' && this.conns[d.cid]) this.conns[d.cid].emit('data', d.d);
  }
  send(to, d) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'to', to, d })); }
  connect(to) { const cid = Math.random().toString(36).slice(2), c = new RelayConn(this, to, cid); this.conns[cid] = c; c.timer = setTimeout(() => this.emit('error', { type: 'peer-unavailable' }), 6000); this.send(to, { t: 'connect', cid }); return c; }
  destroy() { clearInterval(this.ka); try { this.ws.close(); } catch (_) {} }
}
