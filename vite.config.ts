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
const buildHistory = process.env.MIROBOARD_HISTORY_JSON ?? (() => {
  try {
    const tags = new Map(
      execFileSync("git", ["for-each-ref", "--format=%(objectname:short)\t%(refname:short)", "refs/tags"], {
        cwd: __dirname, encoding: "utf8",
      }).trim().split("\n").filter(Boolean).map(line => line.split("\t") as [string, string]),
    );
    return JSON.stringify(
      execFileSync("git", ["log", "-24", "--date=short", "--pretty=format:%h\t%ad\t%s"], {
        cwd: __dirname, encoding: "utf8",
      }).trim().split("\n").filter(Boolean).map(line => {
        const [commit, date, title] = line.split("\t");
        return { commit, date, title, release: tags.get(commit)?.replace("refs/tags/", "") };
      }),
    );
  } catch {
    return "[]";
  }
})();

// https://vite.dev/config/
export default defineConfig({
  define: {
    __MIROBOARD_VERSION__: JSON.stringify(buildVersion),
    __MIROBOARD_HISTORY__: buildHistory,
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
