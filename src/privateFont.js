// Loads the handwriting font from private storage (it can't be in the public
// site because of its licence) and registers it with the page. Kept on the
// device after the first load, like the private images.

import { HANDWRITING_FONT_NAME, HANDWRITING_FONT_PATH } from "./config";
import { loadPrivateImage } from "./privateImage";

let started = false;

export function loadHandwritingFont() {
  if (started || typeof FontFace === "undefined") return;
  started = true;
  loadPrivateImage(HANDWRITING_FONT_PATH).then(async (blob) => {
    if (!blob) return; // falls back to Caveat
    try {
      const face = new FontFace(HANDWRITING_FONT_NAME, await blob.arrayBuffer(), {
        // One regular weight covers every weight, so bold text isn't faked.
        weight: "100 900",
        display: "swap",
        // This font draws – — … as blanks, so leave those to Caveat.
        unicodeRange: "U+0000-2012, U+2015-2025, U+2027-10FFFF",
      });
      await face.load();
      document.fonts.add(face);
    } catch (e) {
      console.warn("Handwriting font didn't load; using Caveat", e);
    }
  });
}
