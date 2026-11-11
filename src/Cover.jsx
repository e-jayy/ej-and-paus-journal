import { useEffect, useRef, useState } from "react";
import { backend } from "./backend";
import { COVER_IMAGE_PATH, COVER_TITLE } from "./config";

const OPEN_MS = 1100;

/**
 * The journal's front cover, shown after signing in. Any key, click or tap
 * swings it open like a real book. The photo comes from the private storage
 * bucket so it's only visible to the two of you.
 */
export default function Cover({ onOpen }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [opening, setOpening] = useState(false);
  const opened = useRef(false);

  const touch =
    typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

  useEffect(() => {
    let alive = true;
    backend
      .getMediaUrl(COVER_IMAGE_PATH)
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
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
  }, [onOpen]);

  return (
    <div className={`cover-screen${opening ? " opening" : ""}`} role="dialog" aria-label={COVER_TITLE}>
      <div className="cover-book">
        <div className="cover-pages" aria-hidden />
        <div className="cover-front">
          {src ? (
            <img src={src} alt={COVER_TITLE} draggable={false} onError={() => setFailed(true)} />
          ) : (
            <div className="cover-fallback">
              {!failed ? null : <span className="cover-label">{COVER_TITLE}</span>}
            </div>
          )}
        </div>
      </div>
      <p className="cover-prompt">
        {touch ? "Tap anywhere" : "Press any button"} to open our journal
      </p>
    </div>
  );
}
