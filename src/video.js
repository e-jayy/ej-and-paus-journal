// Shrinks phone videos before upload.
//
// iPhones record HEVC (H.265) .mov files at roughly 60–170 MB per minute.
// That's too big for the 50 MB upload limit, and some browsers on Windows
// can't play HEVC at all. So each video is re-encoded in the browser
// (using the device's own hardware video encoder via WebCodecs) into a 720p
// H.264 .mp4, which plays everywhere and is ~10x smaller.

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  canEncodeVideo,
} from "mediabunny";

const MAX_SIDE = 1280; // 720p
const MAX_VIDEO_BITRATE = 2_500_000;
const MIN_VIDEO_BITRATE = 350_000;
const AUDIO_BITRATE = 128_000;
// Leave headroom under Supabase's 50 MB per-file cap for container overhead.
const TARGET_BYTES = 44 * 1024 * 1024;

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

export class VideoTooLongError extends Error {}

/**
 * Re-encode a video to a compact H.264 MP4.
 * Resolves to { blob, width, height } — or null if this browser can't do the
 * conversion (the caller then falls back to uploading the original file).
 */
export async function prepareVideo(file, onProgress) {
  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") {
    return null;
  }

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("There's no video in that file.");
    if (!(await track.canDecode())) return null;

    const duration = await input.computeDuration();
    const srcW = track.displayWidth;
    const srcH = track.displayHeight;
    const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH));
    const width = even(srcW * scale);
    const height = even(srcH * scale);

    // Pick a bitrate that keeps the whole clip under the upload limit.
    const budget = Math.floor((TARGET_BYTES * 8) / Math.max(duration, 1)) - AUDIO_BITRATE;
    const bitrate = Math.min(MAX_VIDEO_BITRATE, budget);
    if (bitrate < MIN_VIDEO_BITRATE) {
      const maxMinutes = Math.floor(
        (TARGET_BYTES * 8) / (MIN_VIDEO_BITRATE + AUDIO_BITRATE) / 60,
      );
      throw new VideoTooLongError(
        `That video is too long — clips up to about ${maxMinutes} minutes fit. Try trimming it first.`,
      );
    }

    if (!(await canEncodeVideo("avc", { width, height, bitrate }))) return null;

    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new BufferTarget(),
    });

    const conversion = await Conversion.init({
      input,
      output,
      video: { codec: "avc", width, bitrate, forceTranscode: true },
      // iPhone audio is already AAC, so it's copied as-is when possible.
      audio: { codec: "aac", bitrate: AUDIO_BITRATE },
      showWarnings: false,
    });
    if (!conversion.isValid) return null;

    conversion.onProgress = (p) => onProgress?.(p);
    await conversion.execute();

    const blob = new Blob([output.target.buffer], { type: "video/mp4" });
    return { blob, width, height };
  } finally {
    input.dispose?.();
  }
}
