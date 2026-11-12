// Sticky index tabs on the edge of the book, one per used spread, showing its
// title. They fill the left side top-to-bottom first, then the right side.
// The coloured strips are drawn under the paper (over the black cover); a
// matching invisible layer on top makes them clickable to jump to a spread.

import { useLayoutEffect, useRef } from "react";
import { PAGE_H, SPREAD_W } from "./pages";

const MAX_TEXT = 24; // biggest label size (page units)
const MIN_TEXT = 8;
const LINE = 1.08; // line height

/**
 * Make every label show its whole title: one line if it fits, otherwise two,
 * shrinking the text only as much as needed. Sizes are in page units, so the
 * result doesn't depend on how far you're zoomed in.
 */
function fitLabels(container) {
  if (!container) return;
  for (const label of container.querySelectorAll(".book-tab-label")) {
    const tab = label.parentElement;
    const tabH = parseFloat(tab.style.getPropertyValue("--tab-h")) || 64;
    const room = tabH - 8; // a little breathing space top and bottom
    const z = tab.getBoundingClientRect().height / tabH || 1;
    let size = Math.min(MAX_TEXT, room / LINE);
    for (; size > MIN_TEXT; size -= 0.5) {
      label.style.setProperty("--fit", size);
      const maxH = Math.min(2 * size * LINE, room) * z;
      const fitsTall = label.scrollHeight <= maxH + 1;
      const fitsWide = label.scrollWidth <= label.clientWidth + 1;
      if (fitsTall && fitsWide) break;
    }
    label.style.setProperty("--fit", Math.max(size, MIN_TEXT));
  }
}

// Colours from a pack of sticky index tabs (rainbow order for new tabs).
export const TAB_COLORS = [
  "#fff176", // yellow
  "#ffca28", // amber
  "#ffa726", // orange
  "#ff7043", // deep orange
  "#ef5350", // red
  "#ec407a", // pink
  "#d4ed8a", // pale lime
  "#9ccc65", // lime
  "#66bb6a", // green
  "#26a69a", // teal
  "#29b6f6", // sky
  "#42a5f5", // blue
  "#5c6bc0", // indigo
  "#ab47bc", // purple
];

const PROTRUDE = 230; // how far a tab sticks out past the paper (page units)
const TUCK = 40; // how much is hidden under the paper
const TAB_H = 64;
const GAP = 10;
const MARGIN = 46;
const PER_SIDE = Math.floor((PAGE_H - 2 * MARGIN + GAP) / (TAB_H + GAP)); // 13

/** Dark text on light tabs, white text on dark ones. */
function inkFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#2b2522";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "#2b2522" : "#ffffff";
}

/**
 * Where each tab goes. `spreads` is the list of used spreads in notebook order:
 * [{ n, label, color }]. Returns them with side/top/height in page units.
 */
export function layoutTabs(spreads) {
  const count = spreads.length;
  const perSide = count <= PER_SIDE * 2 ? PER_SIDE : Math.ceil(count / 2);
  const height =
    count <= PER_SIDE * 2 ? TAB_H : Math.max(22, (PAGE_H - 2 * MARGIN - (perSide - 1) * GAP) / perSide);
  return spreads.map((s, i) => {
    const side = i < perSide ? "left" : "right";
    const row = side === "left" ? i : i - perSide;
    const color = s.color || TAB_COLORS[i % TAB_COLORS.length];
    return { ...s, side, top: MARGIN + row * (height + GAP), height, color, ink: inkFor(color) };
  });
}

const box = (t, current) => {
  const out = current ? PROTRUDE + 14 : PROTRUDE;
  return {
    "--tab-top": t.top,
    "--tab-h": t.height,
    "--tab-w": out + TUCK,
    "--tab-x": t.side === "left" ? -out : SPREAD_W - TUCK,
    "--tab-color": t.color,
    "--tab-ink": t.ink,
  };
};

/** The coloured tabs, drawn inside the paper layer (under the pages). */
export function BookTabs({ tabs, current }) {
  const ref = useRef(null);

  // Fit the labels now, and again once the handwriting font arrives.
  useLayoutEffect(() => {
    const run = () => fitLabels(ref.current);
    run();
    document.fonts?.addEventListener?.("loadingdone", run);
    return () => document.fonts?.removeEventListener?.("loadingdone", run);
  }, [tabs, current]);

  return (
    <div className="book-tabs" aria-hidden ref={ref}>
      {tabs.map((t) => (
        <div
          key={t.n}
          className={`book-tab ${t.side}${t.n === current ? " current" : ""}`}
          style={box(t, t.n === current)}
        >
          <span className="book-tab-label">{t.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Invisible buttons over the tabs (above the canvas) so they can be clicked. */
export function BookTabHits({ tabs, current, onGo }) {
  return (
    <div className="book-tab-hits">
      {tabs.map((t) => (
        <button
          key={t.n}
          type="button"
          className={`book-tab-hit ${t.side}`}
          style={box(t, t.n === current)}
          onClick={() => onGo(t.n)}
          title={t.label}
          aria-label={`Go to ${t.label}`}
          aria-current={t.n === current ? "page" : undefined}
        />
      ))}
    </div>
  );
}
