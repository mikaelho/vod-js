// The relay's logic, independent of Cloudflare: one RoomCore per game room. It only passes messages between the players of that room.
// Protocol (JSON text frames):
//   client -> relay  {t:'hi', id}          register under a peer id (first message)
//                    {t:'to', to, d}       send d to peer `to`
//                    {t:'bc', d}           send d to everybody else in the room
//                    {t:'ping'}
//   relay -> client  {t:'ok', id}          registered
//                    {t:'from', from, d}   a message from another peer
//                    {t:'err', type, ...}  'unavailable-id' | 'bad-id' | 'peer-unavailable'
//                    {t:'pong'}
export class RoomCore {
  constructor() { this.byId = new Map(); this.st = new Map(); }
  attach(ws) { this.st.set(ws, { id: null }); }
  detach(ws) { const s = this.st.get(ws); if (s && s.id && this.byId.get(s.id) === ws) this.byId.delete(s.id); this.st.delete(ws); }
  message(ws, text) {
    if (typeof text !== 'string') return;
    if (text.length > 65536) { try { ws.close(1009, 'message too big'); } catch (_) {} return; }
    let m; try { m = JSON.parse(text); } catch (_) { return; }
    const s = this.st.get(ws), out = o => { try { ws.send(JSON.stringify(o)); } catch (_) {} };
    if (!s || !m || typeof m !== 'object') return;
    if (m.t === 'hi') {
      if (s.id) return;
      const id = String(m.id || '');
      if (!/^[A-Za-z0-9_.-]{1,64}$/.test(id)) { out({ t: 'err', type: 'bad-id' }); try { ws.close(1008, 'bad id'); } catch (_) {} return; }
      if (this.byId.has(id)) { out({ t: 'err', type: 'unavailable-id' }); try { ws.close(1000, 'id taken'); } catch (_) {} return; }
      s.id = id; this.byId.set(id, ws); out({ t: 'ok', id });
    } else if (!s.id) return;
    else if (m.t === 'to') {
      const dst = this.byId.get(String(m.to));
      if (!dst) return out({ t: 'err', type: 'peer-unavailable', to: m.to });
      try { dst.send(JSON.stringify({ t: 'from', from: s.id, d: m.d })); } catch (_) {}
    } else if (m.t === 'bc') {
      const msg = JSON.stringify({ t: 'from', from: s.id, d: m.d });
      this.byId.forEach((dst, id) => { if (dst !== ws) try { dst.send(msg); } catch (_) {} });
    } else if (m.t === 'ping') out({ t: 'pong' });
  }
}
