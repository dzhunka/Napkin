export const runtime = "nodejs";

// Plugin submission verifies control of the MCP host by fetching this exact
// token as plain text. The portal issues it, so it arrives as configuration.
export function GET(): Response {
  const token = process.env.OPENAI_APPS_CHALLENGE;

  if (!token) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(token, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
