import { loadEnv, type Plugin } from "vite";
import defaults from "./public-client.json";

// Lovable's static build has no per-project environment store. These defaults are public.
export function clientConfig(mode: string) {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const url = env.VITE_SUPABASE_URL ?? defaults.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? defaults.VITE_SUPABASE_PUBLISHABLE_KEY;
  const project = env.VITE_SUPABASE_PROJECT_ID ?? defaults.VITE_SUPABASE_PROJECT_ID;
  if (url !== `https://${project}.supabase.co` || !/^[a-z0-9]+$/.test(project) ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error("Browser builds require a matching project URL and public Supabase publishable key.");
  }
  if (url !== defaults.VITE_SUPABASE_URL && !env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supply the publishable key for the selected project.");
  }
  const siteKey = env.VITE_TURNSTILE_SITE_KEY ?? "";
  if (siteKey && !/^[0-9A-Za-z_-]{20,35}$/.test(siteKey)) throw new Error("Invalid public Turnstile site key.");
  return { url, define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(url),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(key),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(project),
    "import.meta.env.VITE_TURNSTILE_SITE_KEY": JSON.stringify(siteKey),
  } };
}

export function browserPolicy(url: string) {
  return [
    "default-src 'self'", "base-uri 'none'", "object-src 'none'", "form-action 'self'",
    "script-src 'self' https://challenges.cloudflare.com https://c.daily.co/call-machine/versioned/",
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: "+url,
    "font-src 'self' data:", "media-src 'self' blob:", "worker-src 'self' blob:",
    "frame-src 'self' https://*.daily.co https://challenges.cloudflare.com",
    `connect-src 'self' ${url} ${url.replace("https:", "wss:")} https://*.daily.co wss://*.daily.co https://challenges.cloudflare.com`,
  ].join("; ");
}

export function securityHeaders(policy: string): Plugin {
  const reportOnly = process.env.DOCNOW_CSP_REPORT_ONLY === "1";
  const header = reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
  return {
    name: "docnow-security-headers",
    apply: "build",
    // Static Lovable hosting ignores custom response headers. Enforce supported directives in HTML too.
    transformIndexHtml() {
      if (reportOnly) return [];
      return [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" }];
    },
    generateBundle() {
      const headers = `/*\n  ${header}: ${policy}; frame-ancestors 'none'\n`;
      this.emitFile({ type: "asset", fileName: "_headers", source: headers + (reportOnly ? "" : "  X-Frame-Options: DENY\n") });
    },
  };
}
