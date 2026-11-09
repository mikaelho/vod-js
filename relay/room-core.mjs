// The relay's logic, independent of Cloudflare: one RoomCore per game room. It only passes messages between the players of that room; it knows nothing about the game.
// Protocol (JSON text frames):
//   client -> relay  {t:'hi', id, tok?}    register under a peer id (first message). tok: a private resume token chosen by the client
//                    {t:'to', to, d}       send d to peer `to`
//                    {t:'bc', d}           send d to everybody else in the room
//                    {t:'ping'}            exactly this text; on Cloudflare it is answered without waking the room
//   relay -> client  {t:'ok', id, protocol} registered
//                    {t:'from', from, d}   a message from another peer
//                    {t:'err', type, ...}  'unavailable-id' | 'bad-id' | 'peer-unavailable'
//                    {t:'pong'}
// Taking an id that is still registered (a client reconnecting before the relay noticed its old connection die):
//   - with the same resume token as the old connection: the new connection takes the id at once, and the old one is closed;
//   - otherwise only if the old connection has been silent for staleMs (live clients ping every few seconds); else 'unavailable-id'.
// Hooks (all optional) let the Cloudflare wrapper keep state over hibernation:
//   save(ws, state)   keep { id, tok, seen } with the connection (ws.serializeAttachment)
//   lastSeen(ws)      time (ms) of the last automatic pong to this connection
export const PROTOCOL = 2;
const TOK = /^[A-Za-z0-9_-]{8,64}$/;

export class RoomCore {
  constructor({ staleMs = 70000, maxMessage = 65536, now = () => Date.now(), hooks = {} } = {}) {
    this.byId = new Map(); this.st = new Map(); this.staleMs = staleMs; this.maxMessage = maxMessage; this.now = now; this.hooks = hooks;
  }
  attach(ws) { this.st.set(ws, { id: null, tok: null, seen: this.now() }); }
  restore(ws, saved) { // after hibernation: bring back a connection with what was saved for it
    const s = { id: null, tok: null, seen: 0 }; // when it was last heard comes from the automatic pongs (lastSeen hook), not from the wake-up time
    if (saved && saved.id && !this.byId.has(saved.id)) { s.id = String(saved.id); s.tok = saved.tok || null; s.seen = Number(saved.seen) || 0; this.byId.set(s.id, ws); }
    this.st.set(ws, s);
  }
  detach(ws) { const s = this.st.get(ws); if (s && s.id && this.byId.get(s.id) === ws) this.byId.delete(s.id); this.st.delete(ws); }
  lastSeen(ws, s) { return Math.max(s.seen, Number(this.hooks.lastSeen ? this.hooks.lastSeen(ws) : 0) || 0); }
  evict(ws, why) { this.detach(ws); try { ws.close(4000, why); } catch (_) {} }
  message(ws, text) {
    if (typeof text !== 'string') return;
    const s = this.st.get(ws), out = o => { try { ws.send(JSON.stringify(o)); } catch (_) {} };
    if (!s) return;
    s.seen = this.now();
    if (text.length > this.maxMessage) { try { ws.close(1009, 'message too big'); } catch (_) {} return; }
    let m; try { m = JSON.parse(text); } catch (_) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hi') {
      if (s.id) return;
      const id = String(m.id || ''), tok = typeof m.tok === 'string' && TOK.test(m.tok) ? m.tok : null;
      if (!/^[A-Za-z0-9_.-]{1,64}$/.test(id)) { out({ t: 'err', type: 'bad-id' }); try { ws.close(1008, 'bad id'); } catch (_) {} return; }
      const old = this.byId.get(id);
      if (old && old !== ws) {
        const os = this.st.get(old);
        if (os && tok && os.tok === tok) this.evict(old, 'replaced by a new connection');
        else if (!os || this.now() - this.lastSeen(old, os) > this.staleMs) this.evict(old, 'silent too long');
        else { out({ t: 'err', type: 'unavailable-id' }); try { ws.close(1000, 'id taken'); } catch (_) {} return; }
      }
      s.id = id; s.tok = tok; this.byId.set(id, ws);
      if (this.hooks.save) this.hooks.save(ws, { id, tok, seen: s.seen });
      out({ t: 'ok', id, protocol: PROTOCOL });
    } else if (!s.id) return;
    else if (m.t === 'to') {
      const dst = this.byId.get(String(m.to));
      if (!dst) return out({ t: 'err', type: 'peer-unavailable', to: m.to });
      try { dst.send(JSON.stringify({ t: 'from', from: s.id, d: m.d })); } catch (_) {}
    } else if (m.t === 'bc') {
      const msg = JSON.stringify({ t: 'from', from: s.id, d: m.d });
      this.byId.forEach(dst => { if (dst !== ws) try { dst.send(msg); } catch (_) {} });
    } else if (m.t === 'ping') out({ t: 'pong' });
  }
}
