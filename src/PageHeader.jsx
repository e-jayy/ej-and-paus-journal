// The date and title written on each page.
//
// Titles are centred text boxes. Tap one to get a small bar above it with a
// ⠿ grip (drag anywhere on the page, snapping to the centre line and usual
// height), a font menu and a size slider. The handle on the right edge sets
// the box width; text wraps to fit, so it never gets cut off.

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
// fraction of the page width (x, box centre) and page units from the top (y, box top).
const DEFAULT_X = 0.5;
const DEFAULT_Y = 34; // top edge of the title box
const SNAP_X = 28; // page units
const SNAP_Y = 22;
export const MIN_TITLE_SIZE = 16;
export const MAX_TITLE_SIZE = 120;
const MIN_TITLE_W = 80;
const MAX_TITLE_W = PAGE_W - 40;

const formatDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

/** Live values while dragging/sliding win over the saved ones. */
const titleStyle = (meta, live = {}) => {
  const font = fontFor(meta.titleFont);
  const w = live.w ?? meta.titleW;
  return {
    "--tx": live.x ?? meta.titleX ?? DEFAULT_X,
    "--ty": live.y ?? meta.titleY ?? DEFAULT_Y,
    "--title-font": font.family,
    "--title-size": live.size ?? meta.titleSize ?? font.size,
    "--title-weight": font.weight,
    ...(w ? { width: "calc(" + w + " * var(--z) * 1px)" } : {}),
  };
};

const zoomOf = (el) => parseFloat(el.closest(".page-headers")?.style.getPropertyValue("--z")) || 1;

/** View mode: the title and date exactly where they are, not editable. */
export function PageHeaderView({ side, part, meta }) {
  return (
    <div className={`page-header ${side} read-only`}>
      {part === "date" && (
        <span className="page-date">{meta.date ? formatDate(meta.date) : ""}</span>
      )}
      {part === "title" && meta.title && (
        <div className="title-wrap" style={titleStyle(meta)}>
          <div className="page-title">{meta.title}</div>
        </div>
      )}
    </div>
  );
}

/** `part` is "title" (left page) or "date" (right page). */
export function PageHeader({ side, part, meta, onCommit }) {
  const [title, setTitle] = useState(meta.title || "");
  const [drag, setDrag] = useState(null); // { x, y, snapX, snapY } while dragging
  const [live, setLive] = useState({}); // size/width preview while sliding/resizing
  const sizeTimer = useRef(null);
  const wrapRef = useRef(null);
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
    const z = zoomOf(grip);
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
  const size = live.size ?? meta.titleSize ?? font.size;

  const changeSize = (v) => {
    setLive((l) => ({ ...l, size: v }));
    clearTimeout(sizeTimer.current);
    sizeTimer.current = setTimeout(() => {
      onCommit({ titleSize: v });
      setLive((l) => ({ ...l, size: undefined }));
    }, 350);
  };

  /** Drag the right-edge handle to set the box width (it stays centred). */
  const startResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const z = zoomOf(handle);
    const startW = wrapRef.current.offsetWidth / z;
    const startX = e.clientX;
    let latest = startW;
    const move = (ev) => {
      latest = Math.round(
        Math.min(MAX_TITLE_W, Math.max(MIN_TITLE_W, startW + ((ev.clientX - startX) / z) * 2)),
      );
      setLive((l) => ({ ...l, w: latest }));
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      if (Math.abs(latest - startW) > 1) onCommit({ titleW: latest });
      setLive((l) => ({ ...l, w: undefined }));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  return (
    <div className={`page-header ${side}${drag ? " dragging" : ""}`}>
      {part === "date" && (
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
          aria-label="Date for these pages"
        />
      </label>
      )}

      {part === "title" && drag?.snapX && <div className="snap-guide vertical" aria-hidden />}
      {part === "title" && drag?.snapY && (
        <div className="snap-guide horizontal" aria-hidden style={{ "--ty": DEFAULT_Y }} />
      )}

      {part === "title" && (
      <div
        ref={wrapRef}
        className="title-wrap editable"
        style={titleStyle(meta, { ...live, ...(drag || {}) })}
        data-value={title || "Title"}
      >
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
          <label className="title-size" title="Text size">
            <span aria-hidden>A</span>
            <input
              type="range"
              min={MIN_TITLE_SIZE}
              max={MAX_TITLE_SIZE}
              step={1}
              value={size}
              onChange={(e) => changeSize(Number(e.target.value))}
              aria-label="Title text size"
            />
          </label>
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
        <textarea
          className="page-title"
          value={title}
          placeholder="Title"
          maxLength={120}
          rows={1}
          spellCheck={false}
          aria-label="Title for these pages"
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
          onKeyDown={(e) => {
            // Enter finishes; Shift+Enter starts a new line.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
        <span
          className="title-resize"
          onPointerDown={startResize}
          onDoubleClick={() => onCommit({ titleW: null })}
          role="separator"
          aria-label="Drag to change the title box width (double-click for automatic)"
          title="Drag to change width · double-click for automatic"
        />
      </div>
      )}
    </div>
  );
}
