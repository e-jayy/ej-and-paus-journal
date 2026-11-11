// The notebook is a series of two-page spreads laid out far apart on the
// canvas. Each spread is a locked Excalidraw "frame": anything inside it is
// clipped at the paper's edge, like drawing off the side of a real page.

import {
  convertToExcalidrawElements,
  getCommonBounds,
  newElementWith,
  restoreElements,
} from "@excalidraw/excalidraw";

export const PAGE_W = 700;
export const PAGE_H = 1090; // same proportions as the real journal
export const SPREAD_W = PAGE_W * 2;
// Spreads sit so far apart that you can never see the next one, however far
// you zoom out.
export const STRIDE = 20000;

export const spreadId = (n) => `spread-${n}`;
export const spreadRect = (n) => ({ x: n * STRIDE, y: 0, w: SPREAD_W, h: PAGE_H });
export const isSpreadFrame = (el) => el.type === "frame" && /^spread-\d+$/.test(el.id);

export function spreadOf(el) {
  const m = /^spread-(\d+)$/.exec(el.frameId || "");
  return m ? Number(m[1]) : null;
}

/** Which spread a scene x-coordinate falls nearest to. */
export const spreadAtX = (x) => Math.max(0, Math.round((x - SPREAD_W / 2) / STRIDE));

export function makeSpreadFrame(n) {
  const r = spreadRect(n);
  // Built from a plain rectangle so the id and exact size are kept (the frame
  // helper invents its own id and pads the size).
  const [base] = convertToExcalidrawElements([
    { type: "rectangle", x: r.x, y: r.y, width: r.w, height: r.h },
  ]);
  const [frame] = restoreElements(
    [
      {
        ...base,
        id: spreadId(n),
        type: "frame",
        name: `Pages ${2 * n + 1}–${2 * n + 2}`,
        x: r.x,
        y: r.y,
        width: r.w,
        height: r.h,
        roundness: null,
        backgroundColor: "transparent",
        locked: true,
      },
    ],
    null,
  );
  return frame;
}
/** Highest spread that has anything on it (-1 if the notebook is empty). */
export function lastUsedSpread(elements) {
  let last = -1;
  for (const el of elements) {
    if (el.isDeleted || el.type === "frame") continue;
    const n = spreadOf(el);
    if (n != null && n > last) last = n;
  }
  return last;
}

// These must sit fully on the paper (they're not clipped, or shouldn't be cut).
const MUST_FIT = new Set(["image", "embeddable", "iframe", "text"]);

const shift = (a1, a2, b1, b2) => {
  if (a2 - a1 >= b2 - b1) return b1 - a1;
  if (a1 < b1) return b1 - a1;
  if (a2 > b2) return b2 - a2;
  return 0;
};

/**
 * Keep everything on the pages. Returns the elements that needed changing:
 * - each thing is attached to its spread (so it's clipped at the edges),
 * - photos, videos and text are nudged fully onto the paper,
 * - anything that ended up completely off the paper is moved back on.
 * Groups and text-inside-shapes move together.
 */
export function enforcePages(elements, currentSpread) {
  const live = elements.filter(
    (el) => !el.isDeleted && el.type !== "frame" && el.type !== "magicframe",
  );

  // Units that must move together: groups, and shapes with their label text.
  const units = new Map();
  for (const el of live) {
    const key = el.containerId
      ? `c:${el.containerId}`
      : el.groupIds?.length
        ? `g:${el.groupIds[el.groupIds.length - 1]}`
        : `c:${el.id}`;
    if (!units.has(key)) units.set(key, []);
    units.get(key).push(el);
  }

  const changed = [];
  for (const unit of units.values()) {
    const [x1, y1, x2, y2] = getCommonBounds(unit);
    let n = unit.map(spreadOf).find((s) => s != null);
    if (n == null) {
      const guess = spreadAtX((x1 + x2) / 2);
      const r = spreadRect(guess);
      const cx = (x1 + x2) / 2;
      n = cx >= r.x - PAGE_W && cx <= r.x + r.w + PAGE_W ? guess : currentSpread;
    }
    const r = spreadRect(n);
    const overlaps = x2 > r.x && x1 < r.x + r.w && y2 > r.y && y1 < r.y + r.h;
    const mustFit = unit.some((el) => MUST_FIT.has(el.type));
    let dx = 0;
    let dy = 0;
    if (mustFit || !overlaps) {
      dx = shift(x1, x2, r.x, r.x + r.w);
      dy = shift(y1, y2, r.y, r.y + r.h);
    }
    const frameId = spreadId(n);
    for (const el of unit) {
      if (dx || dy || el.frameId !== frameId) {
        changed.push(newElementWith(el, { x: el.x + dx, y: el.y + dy, frameId }));
      }
    }
  }
  return changed;
}

/**
 * One-off for notebooks made before pages existed: lift everything that isn't
 * on a page and lay it, as one piece, onto the first spread.
 */
export function moveLooseContentOntoFirstSpread(elements) {
  const loose = elements.filter(
    (el) => !el.isDeleted && el.type !== "frame" && spreadOf(el) == null,
  );
  if (!loose.length) return elements;
  const [x1, y1] = getCommonBounds(loose);
  const dx = 60 - x1;
  const dy = 60 - y1;
  const looseIds = new Set(loose.map((el) => el.id));
  return elements.map((el) =>
    looseIds.has(el.id)
      ? newElementWith(el, { x: el.x + dx, y: el.y + dy, frameId: spreadId(0) })
      : el,
  );
}
