import { defineConfig, type PreviewServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFile } from "node:fs/promises";
import { matchPath } from "react-router-dom";
import { routes } from "./src/lib/routes";
import { browserPolicy, clientConfig, securityHeaders } from "./config/browser-security";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const client = clientConfig(mode);
  const policy = browserPolicy(client.url);
  const reportOnly = process.env.DOCNOW_CSP_REPORT_ONLY === "1";
  const cspHeader = reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
  return {
    envPrefix: [],
    define: client.define,
    preview: { headers: { [cspHeader]: policy + "; frame-ancestors https://lovable.dev" } },
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [securityHeaders(policy), {
      name: "preview-document-status",
      configurePreviewServer(server: PreviewServer) {
        const entry = path.resolve(server.config.root, server.config.build.outDir, "index.html");
        server.middlewares.use(async (request, response, next) => {
          const pathname = (request.url ?? "/").split("?")[0];
          const wantsPage = request.headers.accept?.includes("text/html");
          if (!wantsPage || !["GET", "HEAD"].includes(request.method ?? "") ||
              path.extname(pathname) || Object.values(routes).some(route => matchPath(route, pathname))) {
            return next();
          }
          try {
            const shell = await readFile(entry);
            response.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" });
            response.end(request.method === "HEAD" ? undefined : shell);
          } catch (error) { next(error); }
        });
      },
    }, react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
