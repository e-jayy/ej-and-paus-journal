// Frames for photos, videos and GIFs: a plain coloured outline, or a
// "sticky note" (pastel paper + soft shadow + a strip of tape).
//
// They're made of ordinary shapes grouped with the photo, so they move,
// resize, rotate, delete, sync and clip at the page edge along with it.

import { convertToExcalidrawElements, newElementWith } from "@excalidraw/excalidraw";

export const OUTLINE_COLORS = [
  { name: "White", value: "#ffffff" },
  { name: "Black", value: "#1e1e1e" },
  { name: "Pink", value: "#e64980" },
  { name: "Blue", value: "#1c7ed6" },
  { name: "Green", value: "#2f9e44" },
  { name: "Orange", value: "#f08c00" },
  { name: "Purple", value: "#7048e8" },
];

export const NOTE_COLORS = [
  { name: "Yellow", value: "#fff3bf" },
  { name: "Pink", value: "#ffdeeb" },
  { name: "Blue", value: "#d0ebff" },
  { name: "Green", value: "#d3f9d8" },
];

/** Photos, and the videos/GIFs we embed. */
export const isPhoto = (el) =>
  !el.isDeleted && (el.type === "image" || (el.type === "embeddable" && el.customData?.media));

export const outlineOf = (el) => el.customData?.outlineOf || null;

/** The frame style a photo currently has: { kind: "none" | "color" | "note", color }. */
export const photoOutline = (photo) => photo.customData?.outline || { kind: "none" };

const randomId = () => Math.random().toString(36).slice(2, 10);

/** A plain rectangle placed relative to the photo's centre, following its rotation. */
function part(photo, { dx, dy, w, h, tilt = 0 }, props) {
  const cx = photo.x + photo.width / 2;
  const cy = photo.y + photo.height / 2;
  const a = photo.angle || 0;
  const ox = dx * Math.cos(a) - dy * Math.sin(a);
  const oy = dx * Math.sin(a) + dy * Math.cos(a);
  const [rect] = convertToExcalidrawElements([
    { type: "rectangle", x: cx + ox - w / 2, y: cy + oy - h / 2, width: w, height: h },
  ]);
  return {
    ...rect,
    angle: a + tilt,
    roughness: 0,
    strokeWidth: 1,
    fillStyle: "solid",
    roundness: null,
    frameId: photo.frameId,
    ...props,
  };
}

export const DEFAULT_OUTLINE_WIDTH = 6;
export const MIN_OUTLINE_WIDTH = 1;
export const MAX_OUTLINE_WIDTH = 40;

/** The outline: an unfilled rectangle whose line hugs the outside of the photo. */
function borderPart(photo, style) {
  const w = style.width ?? DEFAULT_OUTLINE_WIDTH;
  return part(
    photo,
    { dx: 0, dy: 0, w: photo.width + w, h: photo.height + w },
    {
      backgroundColor: "transparent",
      strokeColor: style.color,
      strokeWidth: w,
    },
  );
}

/**
 * Change just the outline's width (used while dragging the slider), keeping
 * the same border shape instead of rebuilding it.
 */
export function setOutlineWidth(elements, photoId, width) {
  const photo = elements.find((e) => e.id === photoId);
  const style = photoOutline(photo);
  if (!photo || style.kind !== "color") return elements;
  const nextStyle = { ...style, width };
  const fresh = borderPart(photo, nextStyle);
  return elements.map((e) => {
    if (e.id === photoId) {
      return newElementWith(e, { customData: { ...(e.customData || {}), outline: nextStyle } });
    }
    if (outlineOf(e) === photoId && !e.isDeleted && e.customData?.role === "border") {
      return newElementWith(e, {
        x: fresh.x,
        y: fresh.y,
        width: fresh.width,
        height: fresh.height,
        strokeWidth: width,
      });
    }
    return e;
  });
}

/**
 * Change a photo's frame. Returns the full new element list:
 * old frame pieces removed, new ones added (behind the photo, tape on top).
 */
export function setPhotoOutline(elements, photoId, style) {
  const photo = elements.find((e) => e.id === photoId);
  if (!photo) return elements;
  const oldGroup = photo.customData?.outlineGroup;

  // Remove any previous frame pieces and take the photo out of their group.
  let next = elements.map((e) =>
    outlineOf(e) === photoId && !e.isDeleted ? newElementWith(e, { isDeleted: true }) : e,
  );
  const baseGroups = (photo.groupIds || []).filter((g) => g !== oldGroup);

  if (style.kind === "none") {
    return next.map((e) =>
      e.id === photoId
        ? newElementWith(e, {
            groupIds: baseGroups,
            customData: { ...(e.customData || {}), outline: { kind: "none" }, outlineGroup: null },
          })
        : e,
    );
  }

  const group = randomId();
  const groupIds = [group, ...baseGroups];
  const short = Math.min(photo.width, photo.height);
  const mark = (p, role) => ({
    ...p,
    groupIds,
    customData: { outlineOf: photoId, role },
  });

  const behind = [];
  const onTop = [];
  if (style.kind === "color") {
    // Just a line around the photo's edge (no fill), sitting right outside it.
    onTop.push(mark(borderPart(photo, style), "border"));
  } else {
    // Sticky note: more paper at the bottom, like a note or a polaroid.
    const side = Math.max(10, short * 0.07);
    const bottom = Math.max(18, short * 0.18);
    const w = photo.width + side * 2;
    const h = photo.height + side + bottom;
    const dy = (bottom - side) / 2;
    behind.push(
      mark(
        part(photo, { dx: side * 0.25, dy: dy + side * 0.35, w, h }, {
          backgroundColor: "#3b2a1a",
          strokeColor: "transparent",
          opacity: 14,
        }),
        "shadow",
      ),
      mark(
        part(photo, { dx: 0, dy, w, h }, {
          backgroundColor: style.color,
          strokeColor: style.color,
        }),
        "note",
      ),
    );
    onTop.push(
      mark(
        part(
          photo,
          { dx: 0, dy: -photo.height / 2 - side, w: w * 0.34, h: Math.max(12, short * 0.09), tilt: -0.06 },
          { backgroundColor: "#f5e6c8", strokeColor: "transparent", opacity: 75 },
        ),
        "tape",
      ),
    );
  }

  const updatedPhoto = newElementWith(photo, {
    groupIds,
    customData: { ...(photo.customData || {}), outline: style, outlineGroup: group },
  });

  const out = [];
  for (const e of next) {
    if (e.id === photoId) out.push(...behind, updatedPhoto, ...onTop);
    else out.push(e);
  }
  return out;
}

/** Which photo (if exactly one) the current selection is about. */
export function selectedPhotoId(elementsById, selectedIds) {
  const photos = new Set();
  for (const id of selectedIds) {
    const el = elementsById.get(id);
    if (!el || el.isDeleted) continue;
    if (isPhoto(el)) photos.add(el.id);
    else if (outlineOf(el)) photos.add(outlineOf(el));
    else return null; // something else is selected too
  }
  return photos.size === 1 ? [...photos][0] : null;
}
