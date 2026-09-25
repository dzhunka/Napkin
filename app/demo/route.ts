import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

/**
 * The same bundle the MCP route serves as the `ui://` resource, served here as
 * a page so the site's chat mock can host it in a frame. A visit loads it once
 * per conversation in the mock, hence the validator: the browser revalidates
 * and gets a 304 until the build changes.
 */
export async function GET(request: Request): Promise<Response> {
  const file = path.join(process.cwd(), "widget", "dist", "index.html");
  const { size, mtimeMs } = await fs.stat(file);
  const headers = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-cache",
    etag: `"${size.toString(36)}-${mtimeMs.toString(36)}"`,
  };

  if (request.headers.get("if-none-match") === headers.etag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(await fs.readFile(file, "utf8"), { headers });
}
