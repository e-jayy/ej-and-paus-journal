// The date and title written on each page.
//
// Titles are centred by default. Tap one to get a small bar above it with a
// font menu and a ⠿ grip to drag it anywhere on its page; it snaps to the
// centre line, and back to its usual height, when you get close.

import { useEffect, useRef, useState } from "react";
import { PAGE_H, PAGE_W } from "./pages";

export const TITLE_FONTS = [
  { key: "hand", label: "Handwriting", family: '"Caveat", cursive', size: 42, weight: 700 },
  { key: "marker", label: "Marker", family: '"Permanent Marker", cursive', size: 32, weight: 400 },
  { key: "serif", label: "Serif", family: '"Fraunces", Georgia, serif', size: 34, weight: 700 },
  { key: "type", label: "Typewriter", family: '"Special Elite", "Courier New", monospace', size: 32, weight: 400 },
  { key: "round", label: "Rounded", family: '"Nunito", system-ui, sans-serif', size: 34, weight: 800 },
];
const fontFor = (key) => TITLE_FONTS.find((f) => f.key === key) || TITLE_FONTS[0];

// Default spot: centred, in the top margin. Positions are stored as a
// fraction of the page width (x) and page units from the top (y).
const DEFAULT_X = 0.5;
const DEFAULT_Y = 60;
const SNAP_X = 28; // page units
const SNAP_Y = 22;

const formatDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const titleStyle = (meta, pos) => {
  const font = fontFor(meta.titleFont);
  return {
    "--tx": pos?.x ?? meta.titleX ?? DEFAULT_X,
    "--ty": pos?.y ?? meta.titleY ?? DEFAULT_Y,
    "--title-font": font.family,
    "--title-size": font.size,
    "--title-weight": font.weight,
  };
};

/** View mode: the title and date exactly where they are, not editable. */
export function PageHeaderView({ side, meta }) {
  return (
    <div className={`page-header ${side} read-only`}>
      <span className="page-date">{meta.date ? formatDate(meta.date) : ""}</span>
      {meta.title && (
        <div className="title-wrap" style={titleStyle(meta)}>
          <span className="page-title">{meta.title}</span>
        </div>
      )}
    </div>
  );
}

export function PageHeader({ side, meta, onCommit }) {
  const [title, setTitle] = useState(meta.title || "");
  const [drag, setDrag] = useState(null); // { x, y, snapX, snapY } while dragging
  const focused = useRef(false);
  const timer = useRef(null);

  // Show the other person's edits, unless you're typing in it right now.
  useEffect(() => {
    if (!focused.current) setTitle(meta.title || "");
  }, [meta.title]);

  const commitTitle = (v) => {
    clearTimeout(timer.current);
    if (v !== (meta.title || "")) onCommit({ title: v });
  };

  const startDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    const layer = grip.closest(".page-headers");
    const z = parseFloat(layer?.style.getPropertyValue("--z")) || 1;
    const start = {
      px: e.clientX,
      py: e.clientY,
      x: meta.titleX ?? DEFAULT_X,
      y: meta.titleY ?? DEFAULT_Y,
    };
    let latest = { x: start.x, y: start.y };

    const move = (ev) => {
      let x = start.x + (ev.clientX - start.px) / z / PAGE_W;
      let y = start.y + (ev.clientY - start.py) / z;
      x = Math.min(0.95, Math.max(0.05, x));
      y = Math.min(PAGE_H - 30, Math.max(24, y));
      const snapX = Math.abs((x - 0.5) * PAGE_W) < SNAP_X;
      const snapY = Math.abs(y - DEFAULT_Y) < SNAP_Y;
      if (snapX) x = 0.5;
      if (snapY) y = DEFAULT_Y;
      latest = { x, y };
      setDrag({ x, y, snapX, snapY });
    };
    const up = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      setDrag(null);
      if (latest.x !== start.x || latest.y !== start.y) {
        onCommit({ titleX: latest.x, titleY: latest.y });
      }
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  };

  const font = fontFor(meta.titleFont);

  return (
    <div className={`page-header ${side}${drag ? " dragging" : ""}`}>
      <label className={`page-date${meta.date ? "" : " empty"}`}>
        <span>{meta.date ? formatDate(meta.date) : "Add a date"}</span>
        <input
          type="date"
          value={meta.date || ""}
          // Desktop browsers only open the calendar from its small icon, so
          // open it ourselves on any click (phones/tablets do this anyway).
          onClick={(e) => {
            try {
              e.currentTarget.showPicker();
            } catch {
              e.currentTarget.focus();
            }
          }}
          onChange={(e) => onCommit({ date: e.target.value })}
          aria-label={`${side === "L" ? "Left" : "Right"} page date`}
        />
      </label>

      {drag?.snapX && <div className="snap-guide vertical" aria-hidden />}
      {drag?.snapY && <div className="snap-guide horizontal" aria-hidden style={{ "--ty": DEFAULT_Y }} />}

      <div className="title-wrap editable" style={titleStyle(meta, drag)} data-value={title || "Title"}>
        <div className="title-tools">
          <button
            type="button"
            className="title-grip"
            onPointerDown={startDrag}
            aria-label="Drag to move the title"
            title="Drag to move (snaps to the centre)"
          >
            ⠿
          </button>
          <select
            value={font.key}
            onChange={(e) => onCommit({ titleFont: e.target.value })}
            aria-label="Title font"
            title="Title font"
          >
            {TITLE_FONTS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          {(meta.titleX != null || meta.titleY != null) && (
            <button
              type="button"
              className="title-reset"
              onClick={() => onCommit({ titleX: null, titleY: null })}
              title="Put the title back in the centre"
            >
              Centre
            </button>
          )}
        </div>
        <input
          className="page-title"
          value={title}
          placeholder="Title"
          maxLength={80}
          size={1}
          aria-label={`${side === "L" ? "Left" : "Right"} page title`}
          onFocus={() => (focused.current = true)}
          onBlur={(e) => {
            focused.current = false;
            commitTitle(e.target.value);
          }}
          onChange={(e) => {
            const v = e.target.value;
            setTitle(v);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => commitTitle(v), 500);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </div>
    </div>
  );
}
