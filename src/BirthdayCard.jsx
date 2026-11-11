import { useEffect, useState } from "react";
import {
  BIRTHDAY_MESSAGE,
  BIRTHDAY_NAME,
  BIRTHDAY_SIGNATURE,
  SHOW_BIRTHDAY_CARD,
} from "./config";

const KEY = "our-notebook-birthday-seen";

function seen() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Shows once per browser; `replay` (bumped from the menu) shows it again. */
export default function BirthdayCard({ replay = 0 }) {
  const [open, setOpen] = useState(() => SHOW_BIRTHDAY_CARD && !seen());
  useEffect(() => {
    if (replay) setOpen(true);
  }, [replay]);
  if (!open) return null;

  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setOpen(false);
  };

  return (
    <div className="birthday-backdrop" onClick={close}>
      <div className="birthday-card" onClick={(e) => e.stopPropagation()}>
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
        <h1>
          Happy birthday,
          <br />
          <span className="handwritten big">{BIRTHDAY_NAME}</span>
        </h1>
        <p>{BIRTHDAY_MESSAGE}</p>
        <p className="handwritten signature">{BIRTHDAY_SIGNATURE}</p>
        <button className="btn" onClick={close} autoFocus>
          Open our notebook
        </button>
      </div>
    </div>
  );
}
