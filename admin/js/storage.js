// ─────────────────────────────────────────────────────────────────────
// Parure La Plee — Supabase Storage Helpers
// Signed URL resolution with caching
// ─────────────────────────────────────────────────────────────────────

import { USER_CACHE_TTL } from './config.js';

// Global URL cache
const signedUrlCache = new Map(); // path → { url, expiresAt }

export function getCachedSignedUrl(path) {
  const c = signedUrlCache.get(path);
  return c && c.expiresAt > Date.now() ? c.url : null;
}

export function setCachedSignedUrl(path, url) {
  if (path && url) signedUrlCache.set(path, { url, expiresAt: Date.now() + 3500_000 });
}

// Extract storage path from a possibly full Supabase storage URL
export function extractStoragePath(url) {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/(.+)$/);
  if (m) return m[1].split('?')[0];
  if (!url.startsWith('http') && url.includes('/')) return url.replace(/^\/+/, '').split('?')[0];
  return null;
}

const WARDROBE_BUCKETS = ['wardrobe', 'closet', 'community-videos', 'avatars'];
const MARKETPLACE_BUCKETS = ['marketplace', 'marketplace-images', 'wardrobe', 'closet'];

async function bulkSignedUrls(supabase, buckets, paths) {
  const signedMap = new Map();
  const remaining = new Set(paths);

  // Fill from cache first
  for (const p of paths) {
    const cached = getCachedSignedUrl(p);
    if (cached) { signedMap.set(p, cached); remaining.delete(p); }
  }

  if (remaining.size === 0) return signedMap;
  const toFetch = Array.from(remaining);

  for (const bucket of buckets) {
    if (remaining.size === 0) break;
    const current = toFetch.filter(p => !signedMap.has(p));
    if (!current.length) break;
    try {
      for (let i = 0; i < current.length; i += 50) {
        const chunk = current.slice(i, i + 50);
        const { data } = await supabase.storage.from(bucket).createSignedUrls(chunk, 3600);
        if (data) {
          data.forEach(d => {
            if (d?.signedUrl && !d.error) {
              signedMap.set(d.path, d.signedUrl);
              setCachedSignedUrl(d.path, d.signedUrl);
            }
          });
        }
      }
    } catch { /* silently skip bucket */ }
  }
  return signedMap;
}

export async function resolveWardrobeUrls(supabase, items) {
  if (!items?.length) return [];
  const paths = [];
  const pathIndices = new Map();

  items.forEach((item, i) => {
    const url = item.image_url;
    if (!url) return;
    if (url.startsWith('http') && !url.includes('/storage/v1/object/')) return;
    const p = extractStoragePath(url);
    if (p) {
      if (!pathIndices.has(p)) pathIndices.set(p, []);
      pathIndices.get(p).push(i);
      paths.push(p);
    }
  });

  const signedMap = await bulkSignedUrls(supabase, WARDROBE_BUCKETS, [...new Set(paths)]);

  return items.map((item, i) => {
    const url = item.image_url;
    if (!url) return { ...item, _resolved: null };
    if (url.startsWith('http') && !url.includes('/storage/v1/object/')) return { ...item, _resolved: url };
    const p = extractStoragePath(url);
    return { ...item, _resolved: p ? (signedMap.get(p) || null) : null };
  });
}

export async function resolveMarketplaceUrls(supabase, listings) {
  if (!listings?.length) return [];
  const paths = [];
  const pathMap = new Map();

  listings.forEach(l => {
    const raw = (Array.isArray(l.images) && l.images[0]) || l.image_url || l.image;
    if (!raw) return;
    if (raw.startsWith('http') && !raw.includes('/storage/v1/object/')) return;
    const p = extractStoragePath(raw);
    if (p) { pathMap.set(l, p); paths.push(p); }
  });

  const signedMap = await bulkSignedUrls(supabase, MARKETPLACE_BUCKETS, [...new Set(paths)]);

  return listings.map(l => {
    const raw = (Array.isArray(l.images) && l.images[0]) || l.image_url || l.image;
    if (!raw) return { ...l, _resolved: null };
    if (raw.startsWith('http') && !raw.includes('/storage/v1/object/')) return { ...l, _resolved: raw };
    const p = extractStoragePath(raw);
    return { ...l, _resolved: p ? (signedMap.get(p) || null) : null };
  });
}

export async function resolveAvatarUrl(supabase, avatarUrl) {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith('http')) return avatarUrl;
  const path = avatarUrl.replace(/^(avatars|user-avatars)\//, '');
  const cached = getCachedSignedUrl(path);
  if (cached) return cached;
  try {
    const timeout = new Promise(r => setTimeout(() => r(null), 2500));
    const { data } = await Promise.race([
      supabase.storage.from('avatars').createSignedUrl(path, 3600),
      timeout
    ]);
    if (data?.signedUrl) {
      setCachedSignedUrl(path, data.signedUrl);
      return data.signedUrl;
    }
  } catch { /* */ }
  return null;
}

export async function resolveSelfieUrl(supabase, url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  const path = url.replace(/^(selfies|user-selfies|color-analysis|avatars)\//, '');
  const buckets = ['selfies', 'user-selfies', 'color-analysis', 'avatars'];
  for (const b of buckets) {
    try {
      const { data } = await supabase.storage.from(b).createSignedUrl(path, 3600);
      if (data?.signedUrl) return data.signedUrl;
    } catch { /* */ }
  }
  return null;
}
