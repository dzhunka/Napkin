import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Builds the widget into a single self-contained HTML file at
 * `widget/dist/index.html`, which `app/mcp/route.ts` serves as the `ui://`
 * resource.
 *
 * Inlining everything is deliberate: host sandboxes restrict which origins a
 * widget may load subresources from, so a bundle that fetches nothing works
 * everywhere. See DECISIONS.md.
 */
export default defineConfig({
  root: "widget",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
