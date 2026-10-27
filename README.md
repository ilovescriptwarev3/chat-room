# Chat Room

A single-file chat room. Everything the page needs — markup, styles, script, and a copy of the
relay server it talks to — lives inside `index.html`. Messages travel over a WSS WebSocket.

## Look at it on your phone

**Easiest: press Run in the app.** That opens `index.html` in the chat's browser exactly as this
repository's files are. No server, no build step.

## Put it on a permanent address

`index.html` is a static file with no build step, so a static host can serve it over https
forever, from any device, without a machine of yours staying switched on:

- **Cloudflare Pages** — create a project and upload this folder (or connect this repository).
  You get `https://<project>.pages.dev`.
- **GitHub Pages** — push the repository, then Settings → Pages → deploy from a branch. You get
  `https://<user>.github.io/<repo>/`.
- **Netlify Drop** — drag this folder onto `app.netlify.com/drop`.

`index.html` at the top of the folder is the entry, so there is nothing to configure.

Anything served over https forces the chat socket to be `wss://` — browsers refuse a `ws://`
connection from an https page. That is exactly the protocol this page speaks.

## The relay still needs its own home

Static hosting cannot run a WebSocket server, so the room still needs the relay from
**Settings → Need a server?** somewhere behind TLS. Free options that keep it running without
your machine:

- **Render** — a free web service running the relay with `npm i ws && node server.js`. Its
  `https://<service>.onrender.com` address becomes `wss://<service>.onrender.com` for the chat
  page. Free instances sleep when idle and wake on the next connection.
- **Fly.io / Railway** — same relay, same idea, `wss://<app>.fly.dev`.
- **Cloudflare Worker with a Durable Object** — the tidiest free option for a permanent
  `wss://` address, if you are comfortable deploying a Worker.

Every browser that should share a room points at the same `wss://` address and the same room
name. The default `wss://echo.websocket.org` is a test server that reflects your own messages
and nothing else, so it will not connect two people.

## A temporary link from your own machine

For a quick look from another device while the tunnel runs (the URL dies with the process):

1. Start the static server (Node 18+, no dependencies):

   ```sh
   node serve.js
   ```

   It prints `Serving this folder at http://localhost:8080`. Without Node, an equivalent is
   `python3 -m http.server 8080` in this folder.

2. In a second terminal, expose it:

   ```sh
   cloudflared tunnel --url http://localhost:8080
   ```

   If `cloudflared` is missing: `brew install cloudflared` on macOS,
   `winget install --id Cloudflare.cloudflared` on Windows, or grab the binary from the
   Cloudflare releases page on Linux.

3. `cloudflared` prints a link like `https://tidy-otter-abc.trycloudflare.com`. Open that on the
   phone. Hand it to anyone else who should join the room too.

### Things to know

- A quick tunnel is temporary and mints a new URL each time; the static hosts above give you an
  address that stays put.
- There is no login anywhere. Anyone holding the link can read and post in the room, so treat
  the URL as the password.
- A `ws://localhost:8080` address only works when the page itself is opened from localhost. From
  a hosted https page it is blocked, so a reachable relay must be `wss://`.
