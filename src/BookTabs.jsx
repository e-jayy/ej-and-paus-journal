// Sticky index tabs on the edge of the book, one per used spread, showing its
// title. They fill the left side top-to-bottom first, then the right side.
// The coloured strips are drawn under the paper (over the black cover); a
// matching invisible layer on top makes them clickable to jump to a spread.
// Long titles end in "…"; hovering a tab pulls it further out of the book to
// reveal the whole title.

import { PAGE_H, SPREAD_W } from "./pages";

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
const LABEL_INSET = 68; // tip + sticky strip + padding, not available for text

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

/**
 * A tab's geometry. `extra` (page units) is how much further it's pulled out
 * on hover: the tab is made that much longer *under the paper* and then slid
 * outwards with a transform, so it moves smoothly and stays tucked in.
 */
const box = (t, current, extra = 0) => {
  const out = current ? PROTRUDE + 14 : PROTRUDE;
  return {
    "--tab-top": t.top,
    "--tab-h": t.height,
    "--tab-w": out + TUCK + extra,
    "--tab-x": t.side === "left" ? -out : SPREAD_W - TUCK - extra,
    "--extra": extra,
    "--label-w": out - LABEL_INSET + extra,
    "--tab-color": t.color,
    "--tab-ink": t.ink,
  };
};

/**
 * How far to pull a tab out so its whole title shows (0 if it already fits).
 * Measured from the drawn label, in page units.
 */
export function revealDistance(n) {
  const label = document.querySelector(`.book-tab[data-n="${n}"] .book-tab-label`);
  if (!label) return 0;
  const tab = label.parentElement;
  const tabH = parseFloat(tab.style.getPropertyValue("--tab-h")) || TAB_H;
  const z = tab.getBoundingClientRect().height / tabH || 1;
  const hidden = (label.scrollWidth - label.clientWidth) / z;
  return hidden > 1 ? Math.ceil(hidden + 12) : 0;
}

/** The coloured tabs, drawn inside the paper layer (under the pages). */
export function BookTabs({ tabs, current, pulled }) {
  return (
    <div className="book-tabs" aria-hidden>
      {tabs.map((t) => {
        const extra = pulled?.n === t.n ? pulled.extra : 0;
        return (
          <div
            key={t.n}
            data-n={t.n}
            className={`book-tab ${t.side}${t.n === current ? " current" : ""}${extra ? " pulled" : ""}`}
            style={box(t, t.n === current, extra)}
          >
            <span className="book-tab-label">{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Invisible buttons over the tabs (above the canvas): click to jump, hover to pull out. */
export function BookTabHits({ tabs, current, pulled, onGo, onPull }) {
  return (
    <div className="book-tab-hits">
      {tabs.map((t) => {
        const extra = pulled?.n === t.n ? pulled.extra : 0;
        return (
          <button
            key={t.n}
            type="button"
            className={`book-tab-hit ${t.side}${extra ? " pulled" : ""}`}
            style={box(t, t.n === current, extra)}
            onClick={() => onGo(t.n)}
            onPointerEnter={(e) => e.pointerType === "mouse" && onPull(t.n)}
            onPointerLeave={(e) => e.pointerType === "mouse" && onPull(null)}
            onFocus={() => onPull(t.n)}
            onBlur={() => onPull(null)}
            title={t.label}
            aria-label={`Go to ${t.label}`}
            aria-current={t.n === current ? "page" : undefined}
          />
        );
      })}
    </div>
  );
}
