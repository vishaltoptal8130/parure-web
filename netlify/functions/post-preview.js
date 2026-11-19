// ─────────────────────────────────────────────────────────────────────
// Netlify Function: post-preview.js
// ─────────────────────────────────────────────────────────────────────
// Serves parure.app/post/<id> for people and link-preview bots.
//
// WhatsApp, Facebook, iMessage, Slack, X etc. read the og:* tags of a shared
// link to draw a card (photo + title). /open/index.html is static, so every
// post used to show the same bare "parure.app" card. This function reads the
// post's title, author and cover photo from Supabase (via the anon-callable
// get_post_share_preview RPC) and injects per-post tags into the same page.
//
// The page itself is unchanged: it still tries to open the app and shows the
// App Store / Google Play buttons. Phones with the app installed never reach
// this page at all — iOS Universal Links / Android App Links open the app.
//
// Environment variables (optional, defaults are the public app values):
//   - SUPABASE_URL
//   - SUPABASE_ANON_KEY  (public anon key, same one shipped in the app)
// ─────────────────────────────────────────────────────────────────────

import { readFile } from "node:fs/promises";
import path from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://hcunlytijzmzxklrxxsr.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjdW5seXRpanptenhrbHJ4eHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MzYzMzQsImV4cCI6MjA5NzMxMjMzNH0.G_YGI-z7xz-oUeKPCnRjS-_Ei_2yT5eth8iWR4zzPAg";
const SITE = "https://parure.app";
const FALLBACK_IMAGE = `${SITE}/join/icon.png`;
const UUID_RE = /\/post\/([0-9a-fA-F-]{36})\/?$/;

let templateCache = null;

async function loadTemplate() {
  if (templateCache) return templateCache;
  const candidates = [
    path.join(process.cwd(), "open", "index.html"),
    path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "open", "index.html"),
  ];
  for (const file of candidates) {
    try {
      templateCache = await readFile(file, "utf8");
      return templateCache;
    } catch {
      // try next location
    }
  }
  throw new Error("open/index.html not found");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Smaller JPEG via Supabase image transforms so previews load fast. */
function previewImageUrl(url) {
  if (!url || !/^https?:\/\//.test(url)) return FALLBACK_IMAGE;
  if (url.includes("/storage/v1/object/public/")) {
    const base = url.split("?")[0].replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
    return `${base}?width=1080&resize=contain&quality=80`;
  }
  return url;
}

async function fetchPreview(postId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_post_share_preview`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_post_id: postId }),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function buildTags({ title, description, image, url }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const i = escapeHtml(image);
  const u = escapeHtml(url);
  return [
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${u}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="Parure La Plee" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:image" content="${i}" />`,
    `<meta property="og:image:secure_url" content="${i}" />`,
    `<meta property="og:image:alt" content="${t}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${i}" />`,
    `<meta name="apple-itunes-app" content="app-id=6784032743, app-argument=${u}" />`,
  ].join("\n  ");
}

export const handler = async (event) => {
  const rawPath = event.path || "";
  const match = rawPath.match(UUID_RE) || (event.rawUrl || "").split("?")[0].match(UUID_RE);
  const postId = match ? match[1].toLowerCase() : null;
  const url = postId ? `${SITE}/post/${postId}` : SITE;

  let meta = {
    title: "A look on Parure",
    description: "See this look on Parure La Plee, your AI personal stylist.",
    image: FALLBACK_IMAGE,
    url,
  };

  if (postId) {
    try {
      const post = await fetchPreview(postId);
      if (post) {
        const author = post.author_display_name || post.author_handle;
        const heading = post.title || (author ? `A look by ${author}` : "A look on Parure");
        meta = {
          title: author && post.title ? `${post.title} by ${author}` : heading,
          description: post.caption
            ? post.caption
            : author
              ? `See this look by ${author} on Parure La Plee.`
              : meta.description,
          image: previewImageUrl(post.image_url),
          url,
        };
      }
    } catch (err) {
      console.warn("[post-preview] preview lookup failed", err?.message || err);
    }
  }

  let html;
  try {
    html = await loadTemplate();
  } catch (err) {
    console.error("[post-preview]", err);
    return { statusCode: 302, headers: { Location: "/open/" }, body: "" };
  }

  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)} | Parure</title>\n  ${buildTags(meta)}`);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=600",
    },
    body: html,
  };
};
