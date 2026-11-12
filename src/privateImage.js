// Private images (the birthday card) live in the private Supabase bucket, not
// in the public website. They're downloaded after sign-in, kept on the device
// so they show instantly next time, and can be fetched ahead of time.

import { useEffect, useState } from "react";
import { backend } from "./backend";

const CACHE_NAME = "our-notebook";
const inflight = new Map(); // path -> Promise<Blob | null>
/** The last reason each file failed to load (for on-screen messages). */
export const lastError = new Map();

async function cached(path) {
  try {
    const res = await (await caches.open(CACHE_NAME)).match("/private/" + path);
    return res ? await res.blob() : null;
  } catch {
    return null;
  }
}

async function remember(path, blob) {
  try {
    await (await caches.open(CACHE_NAME)).put(
      "/private/" + path,
      new Response(blob, { headers: { "Content-Type": blob.type } }),
    );
  } catch {}
}

/** Start (or reuse) loading an image. Resolves to a Blob, or null if it can't be loaded. */
export function loadPrivateImage(path) {
  if (!inflight.has(path)) {
    inflight.set(
      path,
      (async () => {
        const kept = await cached(path);
        // Refresh the device copy in the background either way.
        const fresh = (async () => {
          for (let attempt = 0; attempt < 4; attempt++) {
            try {
              const blob = await backend.downloadFile(path);
              await remember(path, blob);
              return blob;
            } catch (e) {
              console.warn(`"${path}" didn't load, retrying`, e);
              lastError.set(path, String(e?.message || e?.error || e?.statusCode || e));
              if (/not found/i.test(String(e?.message || ""))) break;
              await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
            }
          }
          return null;
        })();
        return kept || (await fresh);
      })(),
    );
  }
  return inflight.get(path);
}

/** { src, failed } for an image from private storage. */
export function usePrivateImage(path) {
  const [state, setState] = useState({ src: null, failed: false });
  useEffect(() => {
    let alive = true;
    let url = null;
    loadPrivateImage(path).then((blob) => {
      if (!alive) return;
      if (!blob) return setState({ src: null, failed: true });
      url = URL.createObjectURL(blob);
      setState({ src: url, failed: false });
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);
  return state;
}
