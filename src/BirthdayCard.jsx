import { useEffect, useState } from "react";
import {
  BIRTHDAY_CARD_IMAGE_PATH,
  BIRTHDAY_MESSAGE,
  BIRTHDAY_NAME,
  BIRTHDAY_SIGNATURE,
  SHOW_BIRTHDAY_CARD,
} from "./config";
import { usePrivateImage } from "./privateImage";

/**
 * Shows every time the notebook is opened (right after the cover);
 * `replay` (bumped from the ☰ menu) shows it again.
 *
 * The card itself is an image kept in private storage (so it's only visible
 * to the two of you). If it can't load, the text message is shown instead.
 */
export default function BirthdayCard({ replay = 0 }) {
  const [open, setOpen] = useState(SHOW_BIRTHDAY_CARD);
  const [zoomed, setZoomed] = useState(false);
  const { src, failed } = usePrivateImage(BIRTHDAY_CARD_IMAGE_PATH);

  useEffect(() => {
    if (replay) setOpen(true);
  }, [replay]);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e) => e.key === "Escape" && setZoomed(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  if (!open) return null;
  // Wait for the card image (briefly) so it doesn't flash the text first.
  if (!src && !failed) return null;

  const close = () => setOpen(false);

  return (
    <>
      <div className="birthday-backdrop" onClick={close}>
        <div
          className={`birthday-card${src ? " has-image" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="tape" aria-hidden />
          <div className="confetti" aria-hidden>
            {Array.from({ length: 18 }, (_, i) => (
              <span
                key={i}
                style={{
                  "--i": i,
                  "--x": `${(i * 37) % 100}%`,
                  "--d": `${-((i * 53) % 29) / 10}s`,
                }}
              />
            ))}
          </div>

          {src ? (
            <button
              type="button"
              className="birthday-image"
              onClick={() => setZoomed(true)}
              aria-label="Open the birthday card full screen"
              title="Tap to see it bigger"
            >
              <img src={src} alt="Happy birthday card" draggable={false} />
              <span className="zoom-hint" aria-hidden>
                Tap to see it bigger
              </span>
            </button>
          ) : (
            <>
              <h1>
                Happy birthday,
                <br />
                <span className="handwritten big">{BIRTHDAY_NAME}</span>
              </h1>
              <p>{BIRTHDAY_MESSAGE}</p>
              <p className="handwritten signature">{BIRTHDAY_SIGNATURE}</p>
            </>
          )}

          <button className="btn" onClick={close} autoFocus>
            Open EJ and Pau's Journal
          </button>
        </div>
      </div>

      {zoomed && src && (
        <div className="birthday-zoom" onClick={() => setZoomed(false)} role="dialog" aria-label="Birthday card">
          <img src={src} alt="Happy birthday card" draggable={false} />
          <button type="button" className="birthday-zoom-close" aria-label="Close">
            ×
          </button>
        </div>
      )}
    </>
  );
}
