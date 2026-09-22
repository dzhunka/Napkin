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

## 002 — Return the sketch through `ui/message`, not through a tool

**Date:** 2026-09-22
**Status:** Accepted
**Measured against:** the shipped Codex desktop host bundle (`/Applications/ChatGPT.app`),
`@modelcontextprotocol/ext-apps` 2.0.0

### Context

Napkin's whole purpose is getting a drawing from the widget into the model's
hands. The drawing originates in the widget, but the model is on the other side
of the host, and an MCP App has several ways to push something across.

**Through a tool.** The widget calls an app-visible tool — `submit_sketch({ png })`
— and the tool returns the image as content. This is the shape the boilerplate
demonstrates with `set_tone`, and the obvious first instinct.

**Through the host as a user message.** The widget calls `ui/message` with an
image content block, and the host adds it to the thread as though the user had
attached the file themselves.

**Through model context.** The widget calls `ui/update-model-context` with the
image, which the host holds and attaches to the next turn.

### What we measured

The tool route has a hole in it that is easy to miss: the result of a tool the
*widget* invoked is returned to the widget. Nothing in the MCP Apps spec obliges
a host to also put that result in front of the model, and a sketch the model
never sees is useless. Making it work anyway would mean storing the PNG server
side and telling the model to come back for it — which needs shared storage,
because this deploys to serverless functions where no two requests are
guaranteed the same instance. That is a database for something the host already
knows how to carry.

The host bundle settles it. Codex declares, for views where app messages are
enabled:

```js
// /Applications/ChatGPT.app/Contents/Resources/app.asar, minified
hostCapabilities: {
  /* ... */
  message: A ? { text: {}, image: {}, resourceLink: {} } : {},
  updateModelContext: { image: {}, /* ... */ },
}
```

and handles the request by unpacking the content blocks into the composer:

```js
case `ui/message`: {
  let { text: n, imageUrls: i } = j0o(c);
  return await Cn({ source: `mcp_app`, sourceId: m, text: n, imageUrls: i },
    n || ce.formatMessage({ id: `codex.mcpApp.imageMessage`,
      defaultMessage: `Shared an image from {appName}` }));
}
```

That fallback string is localised into every language the app ships, and its
description reads "Message shown in the conversation when an MCP app sends an
image without text". An image arriving from a widget with no accompanying text
is not an edge case someone tolerated; it is a case someone designed for.

### Decision

Submit the sketch with `sendMessage`, carrying a text block and a PNG image
block, and keep no server-side state at all. `open_napkin` opens the napkin and
returns; the image never touches our deployment.

Route by the host's declared capabilities rather than assuming this one. Where a
host takes images in `updateModelContext` but not in `message`, park the image
there and send a short text message as the trigger, because a context update
deliberately does not start a turn. Where a host declares neither, the widget
says so and disables Send instead of dropping a drawing on the floor.

### Consequences

The server stays stateless, which is why there is one tool and no storage,
no upload route, and no expiry to reason about. The sketch arrives in the thread
the same way a photographed napkin used to, so nothing downstream needs to learn
a new shape.

The cost is that submitting depends on a host capability rather than on the tool
call that every MCP host supports. On a host that renders widgets but refuses
images from them, Napkin can draw and cannot send — the one failure we chose to
surface in the UI rather than work around.

Because the image becomes a user message, the user sees it in their own
transcript, and the turn starts whether or not the model asked for it. That is
the intent, but it does mean the widget must not send without an explicit
press.

### What would reopen this

- A host we care about declaring `message` without `image`, making the
  `updateModelContext` fallback the common path rather than the spare one.
- Hosts surfacing app-initiated tool results to the model as a specified
  guarantee, which would make the tool route viable and host-independent.
- Sketches growing past what a host will accept inline, which would force
  server-side storage and a `resourceLink` instead of an image block.
