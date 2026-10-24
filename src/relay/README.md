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

After changing `worker.js`, run `wrangler deploy` again.
