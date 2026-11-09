# VoD relay (Cloudflare Worker)

A tiny WebSocket relay so players can connect without direct browser-to-browser links. Free Cloudflare plan is enough.

## Deploy (about 5 minutes)
1. Install Node.js, then in this folder: `npm install -g wrangler` and `wrangler login`
2. Choose a secret (any characters) and store it **in Cloudflare, not in git**:
   `wrangler secret put RELAY_SECRET`
3. `wrangler deploy` - it prints your relay address, like `vod-relay.<your-name>.workers.dev`
4. Open the game with the relay address and secret in the page address. The part after `#` is never sent to any web server:
   `https://<you>.github.io/<repo>/index.html?relay=vod-relay.<your-name>.workers.dev#key=YOUR-SECRET`

In the address, special characters of the secret must be percent-encoded (for example `@` as `%40`); on the test page you can also type the secret as it is. Everybody who plays needs the same address (including the `#key=...` part). Without the right secret the relay refuses connections.

After changing `worker.js` or `room-core.mjs`, run `wrangler deploy` again.

5. Optional check from a browser or the command line (changes nothing): `curl -H "X-Relay-Key: <base64url of the secret>" https://vod-relay.<your-name>.workers.dev/check`
   answers `{"service":"vod-relay","protocol":2,"key":"ok"}` (`key` is `wrong`, `missing` or `not-set` when something is off).

## Keeping connections reliable
- **Hibernation.** Rooms use Cloudflare's WebSocket Hibernation API: between messages a room can be unloaded while the connections stay open, so an idle room
  (a lobby, a forgotten tab) uses no duration. Pings are answered by Cloudflare itself without waking the room. Each connection's peer id and resume token
  are kept with the connection and restored when the room wakes up.
- **Taking an id back.** A page that reconnects keeps its peer id (other players address it by that id). If the relay has not noticed the old connection die
  (common after a phone sleeps or the network changes), the page's private resume token lets it take the id over at once, and the old connection is closed.
  Without the token, an id is freed only after its connection has been silent for 70 s (pages ping every 5 s).
- **The page side** (`src/net/transport.js`): reconnects with backoff and jitter; notices a dead connection that still looks open (nothing heard for 15 s while
  visible); checks the connection at once when the tab wakes up or the network comes back; and, when connecting keeps failing, asks `/check` and tells the
  player why (wrong secret, relay unreachable, outdated relay, network blocking WebSockets).
- **Versions.** The relay reports its protocol version (2). A page on an older relay still works, without the resume token, and mentions that the relay could be
  redeployed. Pages from before this version work with the new relay unchanged.
- **Tests without Cloudflare:** `node tools/relay-core-test.mjs` (room logic, secret check, /check) and `node tools/relay-flaky-test.js` (three browsers through a
  local relay that cuts and freezes connections).

The relay knows nothing about the game: any page speaking the protocol at the top of `room-core.mjs` can use it, each game in its own room name.
