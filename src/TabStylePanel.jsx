// Edit mode: clicking a sticky tab opens this panel (where the text tool's
// panel appears) to style that tab: colour, end shape, text colour, font,
// bold and italic. In View mode tabs jump to their spread instead.

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { TAB_COLORS, TAB_SHAPES } from "./BookTabs";
import { TITLE_FONTS } from "./PageHeader";

const TEXT_COLORS = ["#2b2522", "#ffffff", "#e03131", "#1971c2", "#2f9e44", "#7048e8"];

export default function TabStylePanel({ label, meta, defaultColor, onCommit, onClose }) {
  const ref = useRef(null);
  const color = meta.tabColor || defaultColor;
  const shape = meta.tabShape || "arrow";
  const font = meta.tabFont || "hand";
  const bold = meta.tabBold ?? true;
  const italic = meta.tabItalic ?? false;

  // Close when tapping anywhere else (except another tab, which re-targets it).
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || e.target.closest?.(".book-tab-hit")) return;
      onClose();
    };
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v || "");

  return createPortal(
    <div className="title-panel tab-panel" ref={ref} role="dialog" aria-label="Tab style">
      <div className="tab-panel-head">
        <span className="tab-panel-title" title={label}>
          Tab: {label}
        </span>
        <button type="button" className="search-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <section>
        <h4>Tab colour</h4>
        <div className="tp-row">
          {TAB_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`tp-swatch tp-tab${color === c ? " active" : ""}`}
              style={{ "--swatch": c }}
              onClick={() => onCommit({ tabColor: c })}
              aria-label={`Tab colour ${c}`}
              title={c}
            />
          ))}
          <label
            className={`tp-swatch tp-custom${!TAB_COLORS.includes(color) ? " active" : ""}`}
            style={{ "--swatch": color }}
            title="Pick any tab colour"
          >
            <input
              type="color"
              value={isHex(color) ? color : "#ffca28"}
              onChange={(e) => onCommit({ tabColor: e.target.value })}
              aria-label="Pick any tab colour"
            />
          </label>
        </div>
      </section>

      <section>
        <h4>End shape</h4>
        <div className="tp-row">
          {TAB_SHAPES.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`tp-btn tp-shape${shape === s.key ? " active" : ""}`}
              onClick={() => onCommit({ tabShape: s.key })}
              title={s.label}
              aria-label={`${s.label} end`}
            >
              <span className="tp-shape-preview" data-shape={s.key} style={{ "--swatch": color }} />
            </button>
          ))}
        </div>
      </section>

      <section>
        <h4>Text colour</h4>
        <div className="tp-row">
          <button
            type="button"
            className={`tp-btn${!meta.tabInk ? " active" : ""}`}
            onClick={() => onCommit({ tabInk: null })}
            title="Dark or white, whichever reads best on the tab"
          >
            Auto
          </button>
          {TEXT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`tp-swatch${meta.tabInk === c ? " active" : ""}`}
              style={{ "--swatch": c }}
              onClick={() => onCommit({ tabInk: c })}
              aria-label={`Text colour ${c}`}
              title={c}
            />
          ))}
          <label
            className={`tp-swatch tp-custom${meta.tabInk && !TEXT_COLORS.includes(meta.tabInk) ? " active" : ""}`}
            style={{ "--swatch": meta.tabInk || "#2b2522" }}
            title="Pick any text colour"
          >
            <input
              type="color"
              value={isHex(meta.tabInk) ? meta.tabInk : "#2b2522"}
              onChange={(e) => onCommit({ tabInk: e.target.value })}
              aria-label="Pick any text colour"
            />
          </label>
        </div>
      </section>

      <section>
        <h4>Font</h4>
        <div className="tp-fonts">
          {TITLE_FONTS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`tp-font${font === f.key ? " active" : ""}`}
              onClick={() => onCommit({ tabFont: f.key })}
              title={f.label}
            >
              <span style={{ fontFamily: f.family }}>Aa</span>
              <small>{f.label}</small>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h4>Style</h4>
        <div className="tp-row">
          <button
            type="button"
            className={`tp-btn${bold ? " active" : ""}`}
            onClick={() => onCommit({ tabBold: !bold })}
            aria-pressed={bold}
            title="Bold"
          >
            <b>B</b>
          </button>
          <button
            type="button"
            className={`tp-btn${italic ? " active" : ""}`}
            onClick={() => onCommit({ tabItalic: !italic })}
            aria-pressed={italic}
            title="Italic"
          >
            <i style={{ fontFamily: "Georgia, serif" }}>I</i>
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
