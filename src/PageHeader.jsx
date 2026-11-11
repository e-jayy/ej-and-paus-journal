// The date and title written on each page.
//
// Titles are text boxes with the same styling options as the notebook's
// text tool: editing one opens a panel (colour, font size, font, alignment,
// opacity) where the text tool's panel appears. The small bar above the title
// has a ⠿ grip (drag anywhere on the page, snapping to the centre line and
// usual height) and Centre; the right-edge handle sets the box width. Text
// wraps to fit, so it never gets cut off.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PAGE_H, PAGE_W } from "./pages";

export const TITLE_FONTS = [
  // The notebook's own text-tool fonts…
  { key: "excali", label: "Hand-drawn", family: '"Excalifont", "Caveat", cursive', size: 36, weight: 400 },
  { key: "normal", label: "Normal", family: '"Nunito", system-ui, sans-serif', size: 34, weight: 600 },
  { key: "code", label: "Code", family: '"Comic Shanns", "Courier New", monospace', size: 32, weight: 400 },
  // …plus a few journal-ish extras.
  { key: "hand", label: "Handwriting", family: '"Caveat", cursive', size: 42, weight: 700 },
  { key: "marker", label: "Marker", family: '"Permanent Marker", cursive', size: 32, weight: 400 },
  { key: "serif", label: "Serif", family: '"Fraunces", Georgia, serif', size: 34, weight: 700 },
  { key: "type", label: "Typewriter", family: '"Special Elite", "Courier New", monospace', size: 32, weight: 400 },
  { key: "round", label: "Rounded", family: '"Nunito", system-ui, sans-serif', size: 34, weight: 800 },
];
const fontFor = (key) =>
  TITLE_FONTS.find((f) => f.key === key) || TITLE_FONTS.find((f) => f.key === "hand");

// Same quick colour picks as the text tool.
export const TITLE_COLORS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"];
const TITLE_SIZES = [
  ["S", 28],
  ["M", 40],
  ["L", 56],
  ["XL", 80],
];
const DEFAULT_COLOR = "#2b2522";

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
    "--title-color": live.color ?? meta.titleColor ?? DEFAULT_COLOR,
    "--title-align": meta.titleAlign ?? "center",
    "--title-opacity": (live.opacity ?? meta.titleOpacity ?? 100) / 100,
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
export function PageHeader({ side, part, meta, onCommit, onActivate }) {
  const [title, setTitle] = useState(meta.title || "");
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef(null);
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

  /** Sliders/colour picker: preview instantly, save once you stop. */
  const LIVE_KEYS = { size: "titleSize", opacity: "titleOpacity", color: "titleColor" };
  const changeLive = (key, v) => {
    setLive((l) => ({ ...l, [key]: v }));
    clearTimeout(sizeTimer.current);
    sizeTimer.current = setTimeout(() => {
      onCommit({ [LIVE_KEYS[key]]: v });
      setLive((l) => ({ ...l, [key]: undefined }));
    }, 350);
  };
  const changeSize = (v) => changeLive("size", v);
  const color = live.color ?? meta.titleColor ?? DEFAULT_COLOR;
  const opacity = live.opacity ?? meta.titleOpacity ?? 100;
  const align = meta.titleAlign ?? "center";

  const openPanel = () => {
    if (!panelOpen) {
      setPanelOpen(true);
      onActivate?.();
    }
  };

  // Close the style panel when tapping anywhere else (or pressing Escape).
  useEffect(() => {
    if (!panelOpen) return;
    const onDown = (e) => {
      if (wrapRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setPanelOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setPanelOpen(false);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [panelOpen]);

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
        onPointerDown={openPanel}
        className={`title-wrap editable${panelOpen ? " active" : ""}`}
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
          onFocus={() => {
            focused.current = true;
            openPanel();
          }}
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

      {part === "title" &&
        panelOpen &&
        createPortal(
          <div
            className="title-panel"
            ref={panelRef}
            role="dialog"
            aria-label="Title style"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <section>
              <h4>Colour</h4>
              <div className="tp-row">
                {TITLE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`tp-swatch${color.toLowerCase() === c ? " active" : ""}`}
                    style={{ "--swatch": c }}
                    onClick={() => onCommit({ titleColor: c })}
                    aria-label={`Colour ${c}`}
                    title={c}
                  />
                ))}
                <span className="tp-divider" aria-hidden />
                <label
                  className={`tp-swatch tp-custom${TITLE_COLORS.includes(color.toLowerCase()) ? "" : " active"}`}
                  style={{ "--swatch": color }}
                  title="Pick any colour"
                >
                  <input
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#2b2522"}
                    onChange={(e) => changeLive("color", e.target.value)}
                    aria-label="Pick any colour"
                  />
                </label>
              </div>
            </section>

            <section>
              <h4>Font size</h4>
              <div className="tp-row">
                {TITLE_SIZES.map(([label, v]) => (
                  <button
                    key={label}
                    type="button"
                    className={`tp-btn${size === v ? " active" : ""}`}
                    onClick={() => onCommit({ titleSize: v })}
                    title={`${label} (${v})`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="tp-slider">
                <input
                  type="range"
                  min={MIN_TITLE_SIZE}
                  max={MAX_TITLE_SIZE}
                  step={1}
                  value={size}
                  onChange={(e) => changeSize(Number(e.target.value))}
                  aria-label="Title text size"
                />
                <span>{size}</span>
              </div>
            </section>

            <section>
              <h4>Font family</h4>
              <div className="tp-fonts">
                {TITLE_FONTS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`tp-font${font.key === f.key ? " active" : ""}`}
                    onClick={() => onCommit({ titleFont: f.key })}
                    title={f.label}
                  >
                    <span style={{ fontFamily: f.family, fontWeight: f.weight }}>Aa</span>
                    <small>{f.label}</small>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h4>Text align</h4>
              <div className="tp-row">
                {["left", "center", "right"].map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={`tp-btn tp-align${align === a ? " active" : ""}`}
                    onClick={() => onCommit({ titleAlign: a })}
                    aria-label={`Align ${a}`}
                    title={`Align ${a}`}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden>
                      {[4, 8, 12, 16].map((y, i) => {
                        const w = i % 2 ? 9 : 14;
                        const x = a === "left" ? 3 : a === "right" ? 17 - w : 10 - w / 2;
                        return <line key={y} x1={x} x2={x + w} y1={y} y2={y} />;
                      })}
                    </svg>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h4>Opacity</h4>
              <div className="tp-slider">
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={opacity}
                  onChange={(e) => changeLive("opacity", Number(e.target.value))}
                  aria-label="Title opacity"
                />
                <span>{opacity}</span>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}
