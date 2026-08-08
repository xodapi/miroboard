import path from "path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const buildVersion = process.env.MIROBOARD_VERSION ?? (() => {
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      cwd: __dirname,
      encoding: "utf8",
    }).trim();
  } catch {
    return "local";
  }
})();

// https://vite.dev/config/
export default defineConfig({
  define: {
    __MIROBOARD_VERSION__: JSON.stringify(buildVersion),
  },
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    assetsInlineLimit: 100_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
