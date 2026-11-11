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
/** A spread's per-page titles/dates, kept on its frame: { L: {title, date}, R: {...} }. */
export const pagesMeta = (frame) => frame?.customData?.pages || {};

/** Copy of a spread frame with one page's title/date changed. */
export function withPageMeta(frame, side, patch) {
  const pages = pagesMeta(frame);
  return newElementWith(frame, {
    customData: {
      ...(frame.customData || {}),
      pages: { ...pages, [side]: { ...(pages[side] || {}), ...patch } },
    },
  });
}

const hasMeta = (frame) =>
  Object.values(pagesMeta(frame)).some((p) => p && (p.title || p.date));

/** Highest spread that has anything on it, or a title/date (-1 if none). */
export function lastUsedSpread(elements) {
  let last = -1;
  for (const el of elements) {
    if (el.isDeleted) continue;
    const n = el.type === "frame" ? (isSpreadFrame(el) && hasMeta(el) ? Number(el.id.slice(7)) : null) : spreadOf(el);
    if (n != null && n > last) last = n;
  }
  return last;
}

/**
 * Number the pages by date. Dated pages come first, oldest first; undated
 * pages follow in the order they sit in the notebook. Spreads are then
 * visited in order of their lowest page number.
 * Returns { numbers: Map("n-L" -> page number), order: [spread indexes] }.
 */
export function orderPages(frames, spreadCount) {
  const byN = new Map(frames.map((f) => [Number(f.id.slice(7)), f]));
  const pages = [];
  for (let n = 0; n < spreadCount; n++) {
    const meta = pagesMeta(byN.get(n));
    for (const side of ["L", "R"]) pages.push({ n, side, date: meta[side]?.date || "" });
  }
  pages.sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (!!a.date !== !!b.date) return a.date ? -1 : 1;
    return a.n - b.n || (a.side === "L" ? -1 : 1);
  });
  const numbers = new Map(pages.map((p, i) => [`${p.n}-${p.side}`, i + 1]));
  const order = [...new Set(pages.map((p) => p.n))].sort(
    (a, b) =>
      Math.min(numbers.get(`${a}-L`), numbers.get(`${a}-R`)) -
      Math.min(numbers.get(`${b}-L`), numbers.get(`${b}-R`)),
  );
  return { numbers, order };
}

/**
 * Keep everything on the pages, without moving anything:
 * - each thing is attached to its spread, so whatever hangs over the paper's
 *   edge is simply hidden there (it still exists, and shows again if moved back),
 * - anything that ends up entirely off the paper is deleted.
 * Only the given (locally changed) elements are checked, so we never touch
 * something the other person is still in the middle of dragging.
 * Groups and text-inside-shapes are treated as one piece.
 */
export function enforcePages(elements, currentSpread, onlyIds) {
  const live = elements.filter(
    (el) => !el.isDeleted && el.type !== "frame" && el.type !== "magicframe",
  );

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
    if (onlyIds && !unit.some((el) => onlyIds.has(el.id))) continue;
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
    const frameId = spreadId(n);
    for (const el of unit) {
      if (!overlaps) changed.push(newElementWith(el, { isDeleted: true }));
      else if (el.frameId !== frameId) changed.push(newElementWith(el, { frameId }));
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
