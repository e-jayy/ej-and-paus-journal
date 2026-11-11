// Helpers for getting photos, GIFs and videos onto the page.

export const isVideo = (file) => file.type.startsWith("video/");
export const isGif = (file) => file.type === "image/gif";
export const isStillImage = (file) => file.type.startsWith("image/") && !isGif(file);

/** Read natural width/height of an image or video file. */
export function measureMedia(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (w, h) => {
      URL.revokeObjectURL(url);
      resolve({ width: w || 480, height: h || 320 });
    };
    if (isVideo(file)) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
      v.onerror = () => done();
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => done(img.naturalWidth, img.naturalHeight);
      img.onerror = () => done();
      img.src = url;
    }
  });
}

/** Fit a size into a box, keeping aspect ratio (tiny things get scaled up a bit). */
export function fitSize({ width, height }, max = 480, min = 160) {
  const longest = Math.max(width, height);
  const scale = longest < min ? min / longest : Math.min(1, max / longest);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Shrink big phone photos before they go into the notebook, so pages stay
 * quick to load. Returns a data URL.
 */
export async function shrinkImage(file, maxSide = 1800) {
  const { width, height } = await measureMedia(file);
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    return {
      dataURL: canvas.toDataURL(type, 0.85),
      mimeType: type,
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function dataURLToBlob(dataURL) {
  return fetch(dataURL).then((r) => r.blob());
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function fileExtension(file) {
  const fromName = file.name?.split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  return file.type.split("/")[1] || "bin";
}
