// Bundles the studio composition + Remotion Player into studio-web/preview.js (committed; rebuild after
// changing studio/src):   node studio-web/preview/build.mjs
import { build } from "../../studio/node_modules/esbuild/lib/main.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const t0 = Date.now();
const r = await build({
  entryPoints: [path.join(here, "entry.tsx")],
  outfile: path.join(here, "..", "preview.js"),
  bundle: true, minify: true, format: "iife", target: ["es2020"], jsx: "automatic",
  nodePaths: [path.join(here, "..", "..", "studio", "node_modules")],
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".png": "dataurl", ".svg": "dataurl" },
  metafile: true, logLevel: "warning",
});
const out = Object.values(r.metafile.outputs)[0];
console.log(`preview.js ${(out.bytes / 1e6).toFixed(2)} MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
