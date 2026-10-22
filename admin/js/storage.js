// ─────────────────────────────────────────────────────────────────────
// Parure La Plee — Supabase Storage Helpers
// Production-grade URL resolution with multi-bucket fallback & caching
// ─────────────────────────────────────────────────────────────────────

import { USER_CACHE_TTL } from './config.js';

// Global URL cache
const signedUrlCache = new Map(); // path → { url, expiresAt }

export function getCachedSignedUrl(path) {
  if (!path) return null;
  const c = signedUrlCache.get(path);
  return c && c.expiresAt > Date.now() ? c.url : null;
}

export function setCachedSignedUrl(path, url) {
  if (path && url) {
    signedUrlCache.set(path, { url, expiresAt: Date.now() + 3500_000 });
  }
}

// Extract bucket and storage path from a URL or relative path
export function extractStorageInfo(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('file:') || url.startsWith('ph:')) {
    return null;
  }

  // Full Supabase storage object URL (public or sign)
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
  if (m && m[1] && m[2]) {
    return {
      bucket: m[1],
      path: m[2].split('?')[0],
      isPublic: url.includes('/storage/v1/object/public/'),
      originalUrl: url
    };
  }

  // Relative storage path: e.g. "wardrobe/uuid/item.png" or "uuid/item.png"
  if (!url.startsWith('http') && url.includes('/')) {
    const clean = url.replace(/^\/+/, '').split('?')[0];
    const slashIdx = clean.indexOf('/');
    const firstPart = clean.slice(0, slashIdx);
    const rest = clean.slice(slashIdx + 1);
    const knownBuckets = [
      'wardrobe', 'closet', 'clothing', 'wardrobe-items',
      'marketplace', 'marketplace-images',
      'avatars', 'user-avatars', 'selfies', 'user-selfies', 'color-analysis',
      'community-videos', 'outfits', 'looks'
    ];

    if (knownBuckets.includes(firstPart)) {
      return { bucket: firstPart, path: rest, isPublic: false, originalUrl: url };
    }
    return { bucket: 'wardrobe', path: clean, isPublic: false, originalUrl: url };
  }

  return null;
}

// Extract path only (for backwards compatibility)
export function extractStoragePath(url) {
  const info = extractStorageInfo(url);
  return info ? info.path : null;
}

const WARDROBE_BUCKETS = ['wardrobe', 'closet', 'clothing', 'wardrobe-items', 'community-videos', 'avatars'];
const MARKETPLACE_BUCKETS = ['marketplace', 'marketplace-images', 'wardrobe', 'closet'];

async function bulkSignedUrls(supabase, buckets, pathInfoList) {
  const signedMap = new Map();
  const remainingByBucket = new Map();

  // Check cache first
  pathInfoList.forEach(({ bucket, path }) => {
    const cacheKey = `${bucket}:${path}`;
    const cached = getCachedSignedUrl(cacheKey) || getCachedSignedUrl(path);
    if (cached) {
      signedMap.set(cacheKey, cached);
      signedMap.set(path, cached);
    } else {
      const bList = bucket ? [bucket, ...buckets.filter(b => b !== bucket)] : buckets;
      const targetBucket = bList[0];
      if (!remainingByBucket.has(targetBucket)) remainingByBucket.set(targetBucket, new Set());
      remainingByBucket.get(targetBucket).add(path);
    }
  });

  // Query primary buckets first
  for (const [bucket, pathSet] of remainingByBucket.entries()) {
    const paths = Array.from(pathSet);
    if (!paths.length) continue;
    try {
      for (let i = 0; i < paths.length; i += 50) {
        const chunk = paths.slice(i, i + 50);
        const { data } = await supabase.storage.from(bucket).createSignedUrls(chunk, 3600);
        if (data && Array.isArray(data)) {
          data.forEach(d => {
            if (d?.signedUrl && !d.error) {
              const cacheKey = `${bucket}:${d.path}`;
              signedMap.set(cacheKey, d.signedUrl);
              signedMap.set(d.path, d.signedUrl);
              setCachedSignedUrl(cacheKey, d.signedUrl);
              setCachedSignedUrl(d.path, d.signedUrl);
            }
          });
        }
      }
    } catch {
      // silently proceed to fallback buckets
    }
  }

  // Check any remaining unresolved paths against fallback buckets
  const stillUnresolved = [];
  pathInfoList.forEach(({ path }) => {
    if (!signedMap.has(path)) stillUnresolved.push(path);
  });

  if (stillUnresolved.length > 0) {
    for (const b of buckets) {
      const pending = stillUnresolved.filter(p => !signedMap.has(p));
      if (!pending.length) break;
      try {
        const { data } = await supabase.storage.from(b).createSignedUrls(pending.slice(0, 50), 3600);
        if (data && Array.isArray(data)) {
          data.forEach(d => {
            if (d?.signedUrl && !d.error) {
              signedMap.set(d.path, d.signedUrl);
              setCachedSignedUrl(d.path, d.signedUrl);
            }
          });
        }
      } catch {
        // silently continue
      }
    }
  }

  return signedMap;
}

export async function resolveWardrobeUrls(supabase, items) {
  if (!items || !items.length) return [];

  const pathInfoList = [];

  items.forEach(item => {
    const raw = item.image_url || item.imageUri || item.photo_url || item.image || item.imageUrl;
    if (!raw) return;
    const info = extractStorageInfo(raw);
    if (info) {
      pathInfoList.push(info);
    }
  });

  const signedMap = await bulkSignedUrls(supabase, WARDROBE_BUCKETS, pathInfoList);

  return items.map(item => {
    const raw = item.image_url || item.imageUri || item.photo_url || item.image || item.imageUrl;
    if (!raw) {
      return { ...item, _resolved: null, _resolvedImageUrl: null };
    }

    // Direct HTTP(s) external URL
    if (raw.startsWith('http') && !raw.includes('/storage/v1/object/')) {
      return { ...item, _resolved: raw, _resolvedImageUrl: raw };
    }

    const info = extractStorageInfo(raw);
    let resolvedUrl = null;

    if (info) {
      const cacheKey = `${info.bucket}:${info.path}`;
      resolvedUrl = signedMap.get(cacheKey) || signedMap.get(info.path);

      // If signed URL not returned, fallback to public URL if known public bucket or already public
      if (!resolvedUrl) {
        if (info.isPublic || raw.startsWith('http')) {
          resolvedUrl = raw;
        } else {
          try {
            const { data } = supabase.storage.from(info.bucket || 'wardrobe').getPublicUrl(info.path);
            if (data?.publicUrl) resolvedUrl = data.publicUrl;
          } catch {
            resolvedUrl = raw;
          }
        }
      }
    } else if (raw.startsWith('http')) {
      resolvedUrl = raw;
    }

    return {
      ...item,
      _resolved: resolvedUrl || raw,
      _resolvedImageUrl: resolvedUrl || raw
    };
  });
}

export async function resolveMarketplaceUrls(supabase, listings) {
  if (!listings || !listings.length) return [];

  const pathInfoList = [];

  listings.forEach(l => {
    const raw = (Array.isArray(l.images) && l.images[0]) || l.image_url || l.image || l.photo_url || l.imageUrl;
    if (!raw) return;
    const info = extractStorageInfo(raw);
    if (info) pathInfoList.push(info);
  });

  const signedMap = await bulkSignedUrls(supabase, MARKETPLACE_BUCKETS, pathInfoList);

  return listings.map(l => {
    const raw = (Array.isArray(l.images) && l.images[0]) || l.image_url || l.image || l.photo_url || l.imageUrl;
    if (!raw) {
      return { ...l, _resolved: null, _resolvedImageUrl: null };
    }

    if (raw.startsWith('http') && !raw.includes('/storage/v1/object/')) {
      return { ...l, _resolved: raw, _resolvedImageUrl: raw };
    }

    const info = extractStorageInfo(raw);
    let resolvedUrl = null;

    if (info) {
      const cacheKey = `${info.bucket}:${info.path}`;
      resolvedUrl = signedMap.get(cacheKey) || signedMap.get(info.path);

      if (!resolvedUrl) {
        if (info.isPublic || raw.startsWith('http')) {
          resolvedUrl = raw;
        } else {
          try {
            const { data } = supabase.storage.from(info.bucket || 'marketplace').getPublicUrl(info.path);
            if (data?.publicUrl) resolvedUrl = data.publicUrl;
          } catch {
            resolvedUrl = raw;
          }
        }
      }
    } else if (raw.startsWith('http')) {
      resolvedUrl = raw;
    }

    const finalUrl = resolvedUrl || raw;
    return {
      ...l,
      _resolved: finalUrl,
      _resolvedImageUrl: finalUrl
    };
  });
}

export async function resolveAvatarUrl(supabase, avatarUrl) {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith('http') && !avatarUrl.includes('/storage/v1/object/')) return avatarUrl;

  const info = extractStorageInfo(avatarUrl);
  const path = info ? info.path : avatarUrl.replace(/^(avatars|user-avatars)\//, '').replace(/^\/+/, '');
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

  if (avatarUrl.startsWith('http')) return avatarUrl;
  try {
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    if (data?.publicUrl) return data.publicUrl;
  } catch { /* */ }

  return null;
}

export async function resolveSelfieUrl(supabase, url) {
  if (!url) return null;
  if (url.startsWith('http') && !url.includes('/storage/v1/object/')) return url;

  const info = extractStorageInfo(url);
  const path = info ? info.path : url.replace(/^(selfies|user-selfies|color-analysis|avatars)\//, '').replace(/^\/+/, '');
  const cached = getCachedSignedUrl(path);
  if (cached) return cached;

  const buckets = ['selfies', 'user-selfies', 'color-analysis', 'avatars'];
  for (const b of buckets) {
    try {
      const { data } = await supabase.storage.from(b).createSignedUrl(path, 3600);
      if (data?.signedUrl) {
        setCachedSignedUrl(path, data.signedUrl);
        return data.signedUrl;
      }
    } catch { /* */ }
  }

  if (url.startsWith('http')) return url;
  try {
    const { data } = supabase.storage.from('selfies').getPublicUrl(path);
    if (data?.publicUrl) return data.publicUrl;
  } catch { /* */ }

  return null;
}
