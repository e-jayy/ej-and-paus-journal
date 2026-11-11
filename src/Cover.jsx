import { useEffect, useRef, useState } from "react";
import { backend } from "./backend";
import { COVER_IMAGE_PATH, COVER_TITLE } from "./config";

const OPEN_MS = 1100;
const WAIT_FOR_PHOTO_MS = 6000; // show the cover anyway after this long
const CACHE_NAME = "our-notebook";
const CACHE_KEY = "/cover-photo";

/** The photo kept on this device after the first load, so it shows instantly. */
async function readCachedCover() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(CACHE_KEY);
    return res ? await res.blob() : null;
  } catch {
    return null;
  }
}

async function writeCachedCover(blob) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(CACHE_KEY, new Response(blob, { headers: { "Content-Type": blob.type } }));
  } catch {
    // no cache available (e.g. private browsing): it just loads each time
  }
}

/**
 * The journal's front cover, shown after signing in. Any key, click or tap
 * swings it open like a real book. The photo comes from the private storage
 * bucket so it's only visible to the two of you; it's fetched before the
 * cover appears (so it never shows up blank) and then kept on the device.
 */
export default function Cover({ onOpen }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [reason, setReason] = useState(""); // why the photo didn't load (shown on the cover)
  const [ready, setReady] = useState(false); // photo loaded, failed, or waited long enough
  const [opening, setOpening] = useState(false);
  const opened = useRef(false);

  const touch =
    typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

  useEffect(() => {
    let alive = true;
    let objectUrl = null;
    const show = (blob) => {
      if (!alive) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    };

    (async () => {
      // 1. The copy on this device (instant), if we have one.
      const cached = await readCachedCover();
      if (cached) show(cached);

      // 2. The real photo (refreshes the device copy), with a few retries.
      for (let attempt = 0; attempt < 4 && alive; attempt++) {
        try {
          const blob = await backend.downloadFile(COVER_IMAGE_PATH);
          await writeCachedCover(blob);
          if (!cached || cached.size !== blob.size) show(blob);
          return;
        } catch (e) {
          console.warn("Cover photo didn't load, retrying", e);
          if (alive) setReason(String(e?.message || e?.error || e?.statusCode || e) + (e?.status ? ` (${e.status})` : ""));
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
      if (alive && !cached) {
        setFailed(true);
        setReady(true);
      }
    })();

    // Never keep you waiting forever.
    const giveUp = setTimeout(() => alive && setReady(true), WAIT_FOR_PHOTO_MS);
    return () => {
      alive = false;
      clearTimeout(giveUp);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const open = (e) => {
      // Keep this key/tap from also reaching the notebook underneath.
      e.preventDefault();
      e.stopPropagation();
      if (opened.current) return;
      opened.current = true;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      setOpening(true);
      setTimeout(onOpen, reduce ? 0 : OPEN_MS);
    };
    window.addEventListener("keydown", open, true);
    window.addEventListener("pointerdown", open, true);
    return () => {
      window.removeEventListener("keydown", open, true);
      window.removeEventListener("pointerdown", open, true);
    };
  }, [onOpen, ready]);

  return (
    <div
      className={`cover-screen${opening ? " opening" : ""}${ready ? " ready" : ""}`}
      role="dialog"
      aria-label={COVER_TITLE}
      aria-busy={!ready}
    >
      {!ready && <p className="cover-waiting">Opening our journal…</p>}
      {/* Hidden until the photo has loaded, so the cover never appears blank. */}
      {src && !ready && (
        <img
          className="cover-preload"
          src={src}
          alt=""
          onLoad={() => setReady(true)}
          onError={() => {
            setFailed(true);
            setReady(true);
          }}
        />
      )}
      {ready && (
        <>
          <div className="cover-book">
            <div className="cover-pages" aria-hidden />
            <div className="cover-front">
              {src && !failed ? (
                <img
                  src={src}
                  alt={COVER_TITLE}
                  draggable={false}
                  onError={() => {
                    setReason("the photo file couldn't be displayed");
                    setFailed(true);
                  }}
                />
              ) : (
                <div className="cover-fallback">
                  <span className="cover-label">{COVER_TITLE}</span>
                </div>
              )}
            </div>
          </div>
          {(failed || !src) && (
            <p className="cover-error">
              {failed || reason
                ? `The cover photo didn't load${reason ? `: ${reason}` : ""}`
                : "The cover photo is still loading…"}
            </p>
          )}
          <p className="cover-prompt">
            {touch ? "Tap anywhere" : "Press any button"} to open our journal
          </p>
        </>
      )}
    </div>
  );
}
