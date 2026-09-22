# Decisions

## 001 — Serve the widget as a self-contained HTML bundle

**Date:** 2026-09-22
**Status:** Accepted
**Measured against:** Codex desktop `codex-cli 0.155.0-alpha.9.2`, Next.js 16.1.6

### Context

There are two ways to produce the `ui://` resource an MCP App serves.

**Live page.** The widget is an ordinary Next.js page. The MCP route fetches its
own rendered HTML and serves that as the resource. The HTML references
`/_next/static/*` chunks, fonts, and CSS, which the host's sandboxed iframe must
then fetch over the network from the deployment's origin. The resource declares
`_meta.ui.csp.resourceDomains` to ask the host to allow those requests. This is
the design inherited from `vercel-labs/mcp-apps-nextjs-starter`, which this
boilerplate was derived from.

**Self-contained bundle.** The widget is built ahead of time into a single HTML
file with all JS and CSS inlined, and the MCP route serves that file's contents.
The iframe makes no subresource requests, so no CSP negotiation is required.

The live-page design is more pleasant to author. The question was whether it
survives contact with real hosts.

### What we measured

We loaded this boilerplate's widget in an isolated Codex desktop instance
(see `scripts/dev-codex.mjs`) against both a local dev server and an HTTPS
tunnel, and read the sandbox's CSP behaviour from the host logs.

Over `http://127.0.0.1:3100` the widget rendered its server HTML but **every
script and stylesheet was refused**. No `/_next/*` request ever reached the dev
server — the sandbox blocked them before they left. The widget appeared as
unstyled text with no hydration and no host bridge. The declared
`resourceDomains` had not been merged into the sandbox CSP.

Over an HTTPS tunnel to the same server, with nothing else changed, the widget
loaded completely: zero `script-src` violations, full styling, hydration, and a
working bridge delivering `structuredContent`.

So Codex honours `csp.resourceDomains`, but only for HTTPS origins.

Reading the shipped app bundle confirms this is deliberate. The host validates
each declared domain and rejects anything that is not `https:` (or `wss:` for
`connectDomains`). There is a localhost escape hatch, but it is gated behind a
feature flag that the production build compiles to a constant `false`:

```js
// ChatGPT.app/Contents/Resources/app.asar, minified
let s = n && _2o() && o.hostname === 'localhost' &&
        (o.protocol === 'http:' || (t && o.protocol === 'ws:'));
if (!(o.protocol === 'https:' || (t && o.protocol === 'wss:') || s) /* ... */) return null;

function _2o() { return !1 }   // only definition in the bundle
```

No environment variable, CLI flag, or config file can change this — it is not a
setting being read, it is a constant. The same path would also require the
hostname to be literally `localhost`, never `127.0.0.1`.

Separately, `base-uri 'self'` is enforced unconditionally, so the `<base href>`
that a live page needs is permanently blocked in Codex. `assetPrefix` makes
asset URLs absolute anyway, so this is survivable but never fixable.

### Decision

Serve the widget as a self-contained bundle. Next.js remains the server hosting
the MCP route; it stops being the renderer of the widget itself.

This also matches the architecture already proven in production in our Engawa
project, which serves a Vite `vite-plugin-singlefile` build and declares no
`csp` block at all.

### Consequences

We gain host portability that does not depend on any host's CSP policy, since
the widget only needs `'unsafe-inline'`. We gain a single round trip instead of
an HTML-then-chunks-then-CSS waterfall, and we remove the partial-failure mode
where a widget renders as readable but unstyled and inert. Because hosts cache
the resource by its `ui://` URI, caching the resource now caches the entire
widget rather than leaving our origin to serve chunks on every open. Local
development no longer needs an HTTPS tunnel.

We lose Next.js's server half inside the widget: no Server Components, no
server-side data fetching, no framework routing. In practice this costs little,
because widget state arrives from the host over `postMessage` rather than from a
server render. We also lose code splitting — the whole bundle ships on every
resource fetch — and the payload travels through the MCP protocol rather than
over HTTP with normal caching.

### What would reopen this

Any of the following would be worth re-measuring:

- Codex shipping a build where the localhost flag is enabled, or exposing it as
  a setting. That would only restore tunnel-free local development; it would not
  address host portability.
- Evidence that Cursor, Claude, and ChatGPT web all honour `resourceDomains`
  reliably, which would make the live-page design defensible again.
- A widget that genuinely needs server-side rendering or data fetching that
  cannot be satisfied through the host bridge.
- Bundle size growing large enough that shipping it on every resource fetch
  costs more than a chunked load would.
