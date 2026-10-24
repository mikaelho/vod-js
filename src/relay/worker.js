// Cloudflare Worker + Durable Object: a WebSocket relay for VoD. Anyone connecting must present the shared secret (RELAY_SECRET).
// The secret travels in the WebSocket subprotocol list as "k.<base64url of the secret>" (subprotocols allow only a few characters, so any secret is encoded), not in the URL, so it stays out of logs.
import { RoomCore } from './room-core.mjs';

const unb64 = s => { try { return new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))); } catch (_) { return null; } };
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

export default {
  async fetch(request, env) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('VoD relay is running.', { status: 200 });
    const key = (request.headers.get('Sec-WebSocket-Protocol') || '').split(',').map(s => s.trim()).find(p => p.startsWith('k.'));
    const given = key && unb64(key.slice(2));
    if (!env.RELAY_SECRET || given === null || !key || !same(given, env.RELAY_SECRET)) return new Response('forbidden', { status: 403 });
    const room = new URL(request.url).pathname.replace(/^\/+/, '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(room)) return new Response('bad room name', { status: 400 });
    return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
  }
};

export class Room {
  constructor() { this.core = new RoomCore(); }
  async fetch() {
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept(); this.core.attach(server);
    server.addEventListener('message', e => this.core.message(server, e.data));
    const bye = () => this.core.detach(server);
    server.addEventListener('close', bye); server.addEventListener('error', bye);
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'vodjs-relay' } });
  }
}
