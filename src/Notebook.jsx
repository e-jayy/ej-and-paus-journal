import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
  convertToExcalidrawElements,
  getSceneVersion,
  reconcileElements,
  restoreElements,
  serializeAsJSON,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import { backend } from "./backend";
import { MAX_UPLOAD_MB, NOTEBOOK_TITLE } from "./config";
import {
  blobToDataURL,
  dataURLToBlob,
  fileExtension,
  fitSize,
  isGif,
  isStillImage,
  isVideo,
  measureMedia,
  shrinkImage,
} from "./media";
import { prepareVideo, VideoTooLongError } from "./video";
import {
  enforcePages,
  isSpreadFrame,
  lastUsedSpread,
  orderPages,
  pagesMeta,
  spreadOf,
  withPageMeta,
  makeSpreadFrame,
  moveLooseContentOntoFirstSpread,
  spreadAtX,
  spreadId,
  spreadRect,
} from "./pages";

const SPREAD_KEY = "our-notebook-spread";
const readSavedSpread = () => {
  try {
    return Math.max(0, Number(localStorage.getItem(SPREAD_KEY)) || 0);
  } catch {
    return 0;
  }
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Videos/GIFs are HTML on top of the canvas, so hide the part past the paper with CSS. */
function paperClip(el) {
  const n = spreadOf(el) ?? spreadAtX(el.x + el.width / 2);
  const r = spreadRect(n);
  const top = Math.max(0, r.y - el.y);
  const left = Math.max(0, r.x - el.x);
  const right = Math.max(0, el.x + el.width - (r.x + r.w));
  const bottom = Math.max(0, el.y + el.height - (r.y + r.h));
  if (!top && !left && !right && !bottom) return undefined;
  return { clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px)` };
}
const BROADCAST_MS = 80;
const CURSOR_MS = 60;
const SAVE_MS = 500;

// Changes not yet confirmed saved are also kept on this device, so closing the
// tab mid-save or being offline never loses anything: they're sent next time.
// Each open tab keeps its own copy, so one tab closing can't erase another's.
const UNSAVED_PREFIX = "our-notebook-unsaved:";
const TAB_ID = Math.random().toString(36).slice(2);

/** Collect (and clear) leftovers from any earlier tab on this device, once per page load. */
let leftovers = null;
const takeLeftoverUnsaved = () => (leftovers ??= collectLeftovers());
const collectLeftovers = () => {
  const out = [];
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(UNSAVED_PREFIX)) continue;
      try {
        out.push(...JSON.parse(localStorage.getItem(key) || "[]"));
      } catch {}
      localStorage.removeItem(key);
    }
  } catch {}
  return out;
};
const writeUnsaved = (map) => {
  try {
    const key = UNSAVED_PREFIX + TAB_ID;
    if (map.size) localStorage.setItem(key, JSON.stringify([...map.values()]));
    else localStorage.removeItem(key);
  } catch {
    // storage full or blocked: the in-memory retry still runs
  }
};

// Videos and GIFs live on the page as "embeddable" elements whose link points
// back here; renderEmbeddable swaps the iframe for a real <video>/<img>.
const MEDIA_MARK = "#media/";
const mediaLink = (path) =>
  `${window.location.origin}${window.location.pathname}${MEDIA_MARK}${path}`;

function MediaEmbed({ media, clip }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let tries = 0;
    const load = () =>
      backend
        .getMediaUrl(media.path)
        .then((url) => alive && setSrc(url))
        .catch(() => {
          // The other person may still be uploading it — try again shortly.
          if (alive && ++tries < 20) setTimeout(load, 1500);
          else if (alive) setFailed(true);
        });
    load();
    return () => {
      alive = false;
    };
  }, [media.path]);

  if (failed) return <div className="media-placeholder">Couldn't load this one</div>;
  if (!src) return <div className="media-placeholder">Loading…</div>;
  if (media.mime.startsWith("video/")) {
    return (
      <video className="media-fill" style={clip} src={src} controls playsInline loop preload="metadata" />
    );
  }
  return <img className="media-fill" style={clip} src={src} alt="" draggable={false} />;
}

const formatDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

/** The title + date written at the top of one page. */
function PageHeader({ side, meta, onCommit }) {
  const [title, setTitle] = useState(meta.title || "");
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

  return (
    <div className={`page-header ${side}`}>
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
          aria-label={`${side === "L" ? "Left" : "Right"} page date`}
        />
      </label>
      <input
        className="page-title"
        value={title}
        placeholder="Title"
        maxLength={80}
        aria-label={`${side === "L" ? "Left" : "Right"} page title`}
        onFocus={() => (focused.current = true)}
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
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </div>
  );
}

export default function Notebook({ user }) {
  const [api, setApi] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [busyUploads, setBusyUploads] = useState(0);
  const [progress, setProgress] = useState(null); // { label, value: 0..1 | null }
  const [saveState, setSaveState] = useState("saved"); // saved | saving | error
  const fileInput = useRef(null);

  // Which two-page spread is open (0 = pages 1–2).
  const [spread, setSpread] = useState(0);
  const [lastUsed, setLastUsed] = useState(-1);
  const [peerSpreads, setPeerSpreads] = useState({}); // clientId -> { name, spread }
  const [frames, setFrames] = useState([]); // spread frames (hold page titles/dates)
  const headersRef = useRef(null);
  const spreadRef = useRef(0);
  const lastUsedRef = useRef(-1);
  const navigating = useRef(false);
  const paperRef = useRef(null);
  const wasEditingText = useRef(false);

  const clientId = useMemo(() => crypto.randomUUID(), []);
  const room = useRef(null);
  const apiRef = useRef(null);
  const sync = useRef({
    versions: new Map(), // element id -> last version we've seen/sent
    sceneVersion: -1,
    toBroadcast: new Map(),
    toSave: new Map(),
    broadcastTimer: null,
    saveTimer: null,
    knownFiles: new Set(), // file ids already in storage
    dirty: new Set(), // ids changed on this device since the last page check
    unsaved: new Map(), // id -> element not yet confirmed saved
    framesSig: "",
    fetching: new Set(),
    collaborators: new Map(),
    lastCursor: 0,
    cursorTimer: null,
  });

  // ---------- loading ----------

  const initialData = useMemo(
    () =>
      backend.loadElements().then((fromServer) => {
        let loaded = fromServer;
        const s = sync.current;
        for (const el of loaded) {
          s.versions.set(el.id, el.version);
          if (el.fileId) s.knownFiles.add(el.fileId);
        }
        // Bring back anything this device changed but never got to save.
        const byId = new Map(loaded.map((el) => [el.id, el]));
        for (const el of takeLeftoverUnsaved()) {
          const saved = byId.get(el.id);
          if (!saved || el.version > saved.version) {
            byId.set(el.id, el);
            s.unsaved.set(el.id, el); // re-kept under this tab until it's saved
          }
        }
        writeUnsaved(s.unsaved);
        loaded = [...byId.values()];
        // Anything from before pages existed goes onto the first spread
        // (version bumps mean it's saved + shared on the first change pass).
        let elements = moveLooseContentOntoFirstSpread(restoreElements(loaded, null));
        const last = lastUsedSpread(elements);
        const have = new Set(elements.filter((e) => !e.isDeleted).map((e) => e.id));
        const frames = [];
        for (let n = 0; n <= last + 1; n++) {
          if (!have.has(spreadId(n))) frames.push(makeSpreadFrame(n));
        }
        elements = [...frames, ...elements];
        lastUsedRef.current = last;
        return {
          elements,
          appState: {
            viewBackgroundColor: "transparent", // the paper is drawn underneath
            currentItemFontFamily: 1,
            frameRendering: { enabled: true, name: false, outline: false, clip: true },
          },
        };
      }),
    [],
  );

  const fetchMissingFiles = useCallback(async (elements) => {
    const excalidraw = apiRef.current;
    if (!excalidraw) return;
    const s = sync.current;
    const have = excalidraw.getFiles();
    for (const el of elements) {
      if (el.type !== "image" || !el.fileId || el.isDeleted) continue;
      if (have[el.fileId] || s.fetching.has(el.fileId)) continue;
      s.fetching.add(el.fileId);
      (async () => {
        for (let attempt = 0; attempt < 10; attempt++) {
          try {
            const blob = await backend.downloadFile(`files/${el.fileId}`);
            const dataURL = await blobToDataURL(blob);
            s.knownFiles.add(el.fileId);
            excalidraw.addFiles([
              { id: el.fileId, dataURL, mimeType: blob.type || "image/png", created: Date.now() },
            ]);
            break;
          } catch {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
        s.fetching.delete(el.fileId);
      })();
    }
  }, []);

  // ---------- pages ----------

  /** Line the paper (a normal DOM layer under the transparent canvas) up with the canvas. */
  const positionPaper = useCallback((scrollX, scrollY, zoom) => {
    const el = paperRef.current;
    if (!el) return;
    const r = spreadRect(spreadRef.current);
    const t = `translate(${(r.x + scrollX) * zoom}px, ${(r.y + scrollY) * zoom}px)`;
    for (const layer of [el, headersRef.current]) {
      if (!layer) continue;
      layer.style.setProperty("--z", zoom);
      layer.style.transform = t;
    }
  }, []);

  const ensureSpreadFrame = useCallback((n) => {
    const ex = apiRef.current;
    const all = ex.getSceneElementsIncludingDeleted();
    if (all.some((e) => e.id === spreadId(n) && !e.isDeleted)) return;
    ex.updateScene({
      elements: [makeSpreadFrame(n), ...all.filter((e) => e.id !== spreadId(n))],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, []);

  const goToSpread = useCallback(
    (n) => {
      const ex = apiRef.current;
      if (!ex) return;
      n = clamp(n, 0, lastUsedRef.current + 1);
      ensureSpreadFrame(n);
      spreadRef.current = n;
      setSpread(n);
      try {
        localStorage.setItem(SPREAD_KEY, String(n));
      } catch {}
      navigating.current = true;
      const frame = ex.getSceneElements().find((e) => e.id === spreadId(n));
      ex.scrollToContent(frame, { fitToViewport: true, viewportZoomFactor: 0.92, animate: false });
      requestAnimationFrame(() => {
        navigating.current = false;
        const st = ex.getAppState();
        positionPaper(st.scrollX, st.scrollY, st.zoom.value);
      });
    },
    [ensureSpreadFrame, positionPaper],
  );

  /** Save a page's title/date onto its spread frame (synced like everything else). */
  const updatePageMeta = useCallback(
    (n, side, patch) => {
      const ex = apiRef.current;
      if (!ex) return;
      ensureSpreadFrame(n);
      const all = ex.getSceneElementsIncludingDeleted();
      const frame = all.find((e) => e.id === spreadId(n));
      const updated = withPageMeta(frame, side, patch);
      ex.updateScene({
        elements: all.map((e) => (e.id === updated.id ? updated : e)),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    },
    [ensureSpreadFrame],
  );

  /** Keep panning on the open spread (zooming stays unlimited). */
  const onScrollChange = useCallback(
    (scrollX, scrollY, zoom) => {
      positionPaper(scrollX, scrollY, zoom.value);
      const ex = apiRef.current;
      if (navigating.current || !ex) return;
      const st = ex.getAppState();
      const z = zoom.value;
      const r = spreadRect(spreadRef.current);
      const cx = -scrollX + st.width / 2 / z;
      const cy = -scrollY + st.height / 2 / z;
      const nx = clamp(cx, r.x, r.x + r.w);
      const ny = clamp(cy, r.y, r.y + r.h);
      if (nx !== cx || ny !== cy) {
        ex.updateScene({
          appState: { scrollX: -(nx - st.width / 2 / z), scrollY: -(ny - st.height / 2 / z) },
        });
      }
    },
    [positionPaper],
  );

  /** After each drawing/drag/edit, keep everything on the paper. */
  const enforce = useCallback(() => {
    const ex = apiRef.current;
    if (!ex) return;
    const st = ex.getAppState();
    if (
      st.newElement ||
      st.editingTextElement ||
      st.resizingElement ||
      st.multiElement ||
      st.selectedElementsAreBeingDragged
    ) {
      return;
    }
    const all = ex.getSceneElementsIncludingDeleted();
    const s = sync.current;
    if (!s.dirty.size) return;
    const fixed = enforcePages(all, spreadRef.current, s.dirty);
    s.dirty.clear();
    if (!fixed.length) return;
    const byId = new Map(fixed.map((e) => [e.id, e]));
    ex.updateScene({
      elements: all.map((e) => byId.get(e.id) || e),
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    });
  }, []);

  const onPointerUp = useCallback(() => setTimeout(enforce, 0), [enforce]);

  useEffect(() => {
    if (!api) return;
    apiRef.current = api;
    initialData.then(({ elements }) => {
      fetchMissingFiles(elements);
      setLastUsed(lastUsedRef.current);
      // Let Excalidraw finish loading the scene, then open the saved spread.
      requestAnimationFrame(() => {
        goToSpread(readSavedSpread());
        enforce();
      });
    });
  }, [api, initialData, fetchMissingFiles, goToSpread, enforce]);

  // Keep the paper aligned when the window resizes.
  useEffect(() => {
    if (!api) return;
    const onResize = () => {
      const st = api.getAppState();
      positionPaper(st.scrollX, st.scrollY, st.zoom.value);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [api, positionPaper]);

  // ---------- saving + broadcasting ----------

  const flushSave = useCallback(async () => {
    const s = sync.current;
    clearTimeout(s.saveTimer);
    s.saveTimer = null;
    if (!s.toSave.size) return;
    const batch = [...s.toSave.values()];
    s.toSave.clear();
    setSaveState("saving");
    try {
      await backend.saveElements(batch);
      for (const el of batch) {
        if (s.unsaved.get(el.id)?.version === el.version) s.unsaved.delete(el.id);
      }
      writeUnsaved(s.unsaved);
      setSaveState(s.toSave.size || s.unsaved.size ? "saving" : "saved");
    } catch (e) {
      console.error("Save failed, will retry", e);
      for (const el of batch) if (!s.toSave.has(el.id)) s.toSave.set(el.id, el);
      writeUnsaved(s.unsaved);
      setSaveState("error");
      s.saveTimer = setTimeout(flushSave, 4000);
    }
  }, []);

  const flushBroadcast = useCallback(() => {
    const s = sync.current;
    s.broadcastTimer = null;
    if (!s.toBroadcast.size || !room.current) return;
    room.current.sendElements([...s.toBroadcast.values()]);
    s.toBroadcast.clear();
  }, []);

  const uploadImageFile = useCallback(async (file) => {
    try {
      const blob = await dataURLToBlob(file.dataURL);
      await backend.uploadFile(`files/${file.id}`, blob);
    } catch (e) {
      console.error(e);
      sync.current.knownFiles.delete(file.id);
      apiRef.current?.setToast({ message: "A photo didn't upload — try adding it again.", closable: true });
    }
  }, []);

  /** Re-read page titles/dates and how far the notebook is used. */
  const refreshPageState = useCallback((elements) => {
    const s = sync.current;
    const frames = elements.filter((e) => !e.isDeleted && isSpreadFrame(e));
    const sig = frames.map((f) => f.id + ":" + f.version).join(",");
    if (sig !== s.framesSig) {
      s.framesSig = sig;
      setFrames(frames);
    }
    const last = lastUsedSpread(elements);
    if (last !== lastUsedRef.current) {
      lastUsedRef.current = last;
      setLastUsed(last);
    }
  }, []);

  const onChange = useCallback(
    (elements, appState, files) => {
      const s = sync.current;

      // Finished typing a text box → make sure it sits on the page.
      const editing = !!appState.editingTextElement;
      if (wasEditingText.current && !editing) setTimeout(enforce, 0);
      wasEditingText.current = editing;

      for (const id in files) {
        if (!s.knownFiles.has(id) && files[id].dataURL) {
          s.knownFiles.add(id);
          uploadImageFile(files[id]);
        }
      }

      const sceneVersion = getSceneVersion(elements);
      if (sceneVersion === s.sceneVersion) return;
      s.sceneVersion = sceneVersion;

      refreshPageState(elements);

      let changed = false;
      for (const el of elements) {
        if (s.versions.get(el.id) !== el.version) {
          s.versions.set(el.id, el.version);
          s.toBroadcast.set(el.id, el);
          s.toSave.set(el.id, el);
          s.unsaved.set(el.id, el);
          s.dirty.add(el.id);
          changed = true;
        }
      }
      if (!changed) return;
      setSaveState((prev) => (prev === "error" ? prev : "saving"));
      if (!s.broadcastTimer) s.broadcastTimer = setTimeout(flushBroadcast, BROADCAST_MS);
      clearTimeout(s.saveTimer);
      s.saveTimer = setTimeout(flushSave, SAVE_MS);
    },
    [flushBroadcast, flushSave, uploadImageFile, enforce, refreshPageState],
  );

  // ---------- receiving ----------

  const applyRemoteElements = useCallback(
    (remote) => {
      const excalidraw = apiRef.current;
      if (!excalidraw || !remote?.length) return;
      const s = sync.current;
      const reconciled = reconcileElements(
        excalidraw.getSceneElementsIncludingDeleted(),
        restoreElements(remote, null),
        excalidraw.getAppState(),
      );
      for (const el of reconciled) s.versions.set(el.id, el.version);
      for (const el of remote) s.dirty.delete(el.id);
      s.sceneVersion = getSceneVersion(reconciled);
      excalidraw.updateScene({
        elements: reconciled,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      refreshPageState(reconciled);
      fetchMissingFiles(remote);
    },
    [fetchMissingFiles, refreshPageState],
  );

  const pushCollaborators = () =>
    apiRef.current?.updateScene({ collaborators: new Map(sync.current.collaborators) });

  useEffect(() => {
    if (!api) return;
    const s = sync.current;
    const r = backend.joinRoom({
      clientId,
      user,
      onStatus: setStatus,
      onElements: applyRemoteElements,
      onCursor: (c) => {
        const prev = s.collaborators.get(c.clientId) || {};
        s.collaborators.set(c.clientId, {
          ...prev,
          id: c.clientId,
          socketId: c.clientId,
          username: c.name,
          color: c.color,
          pointer: c.pointer,
          button: c.button,
          selectedElementIds: c.selectedElementIds,
        });
        pushCollaborators();
        // Track which spread the other person is on (only re-render on change).
        if (c.pointer) {
          const theirs = spreadAtX(c.pointer.x);
          setPeerSpreads((prev) =>
            prev[c.clientId]?.spread === theirs
              ? prev
              : { ...prev, [c.clientId]: { name: c.name, spread: theirs } },
          );
        }
      },
      onPeers: (peers) => {
        const next = new Map();
        for (const p of peers) {
          const prev = s.collaborators.get(p.clientId) || {};
          next.set(p.clientId, {
            ...prev,
            id: p.clientId,
            socketId: p.clientId,
            username: p.name,
            color: p.color,
          });
        }
        s.collaborators = next;
        pushCollaborators();
        setPeerSpreads((prev) => {
          const kept = Object.fromEntries(Object.entries(prev).filter(([id]) => next.has(id)));
          return Object.keys(kept).length === Object.keys(prev).length ? prev : kept;
        });
      },
      onReconnect: () => {
        flushSave();
        backend.loadElements().then(applyRemoteElements).catch(console.error);
      },
    });
    room.current = r;

    const keepAndFlush = () => {
      writeUnsaved(s.unsaved);
      flushSave();
    };
    const flushOnHide = () => {
      if (document.visibilityState === "hidden") keepAndFlush();
    };
    document.addEventListener("visibilitychange", flushOnHide);
    window.addEventListener("beforeunload", keepAndFlush);
    window.addEventListener("pagehide", keepAndFlush);
    window.addEventListener("online", flushSave);

    return () => {
      keepAndFlush();
      r.leave();
      room.current = null;
      document.removeEventListener("visibilitychange", flushOnHide);
      window.removeEventListener("beforeunload", keepAndFlush);
      window.removeEventListener("pagehide", keepAndFlush);
      window.removeEventListener("online", flushSave);
    };
  }, [api, clientId, user, applyRemoteElements, flushSave]);

  const onPointerUpdate = useCallback(
    ({ pointer, button }) => {
      const s = sync.current;
      const send = () => {
        s.cursorTimer = null;
        s.lastCursor = Date.now();
        room.current?.sendCursor({
          clientId,
          name: user.name,
          color: user.color,
          pointer: s.pendingPointer.pointer,
          button: s.pendingPointer.button,
          selectedElementIds: apiRef.current?.getAppState().selectedElementIds,
        });
      };
      s.pendingPointer = { pointer, button };
      if (s.cursorTimer) return;
      const wait = CURSOR_MS - (Date.now() - s.lastCursor);
      if (wait <= 0) send();
      else s.cursorTimer = setTimeout(send, wait);
    },
    [clientId, user],
  );

  // ---------- adding photos, GIFs and videos ----------

  const sceneCenter = () => {
    const st = apiRef.current.getAppState();
    return viewportCoordsToSceneCoords(
      { clientX: st.offsetLeft + st.width / 2, clientY: st.offsetTop + st.height / 2 },
      st,
    );
  };

  const insertFiles = useCallback(async (fileList, at) => {
    const excalidraw = apiRef.current;
    if (!excalidraw) return;
    const files = [...fileList].filter((f) => isVideo(f) || f.type.startsWith("image/"));
    if (!files.length) {
      excalidraw.setToast({ message: "That file type can't go in the notebook.", closable: true });
      return;
    }
    let { x, y } = at || sceneCenter();
    const created = [];

    const tooBig = (f) => f.size > MAX_UPLOAD_MB * 1024 * 1024;

    for (const file of files) {
      // Videos get shrunk first, so only photos/GIFs are checked up front.
      if (!isVideo(file) && tooBig(file)) {
        excalidraw.setToast({
          message: `"${file.name}" is over ${MAX_UPLOAD_MB} MB — try a smaller version.`,
          closable: true,
          duration: 6000,
        });
        continue;
      }
      setBusyUploads((n) => n + 1);
      try {
        if (isStillImage(file)) {
          const img = await shrinkImage(file);
          const fileId = crypto.randomUUID();
          const size = fitSize(img, 420);
          excalidraw.addFiles([
            { id: fileId, dataURL: img.dataURL, mimeType: img.mimeType, created: Date.now() },
          ]);
          created.push(
            ...convertToExcalidrawElements([
              {
                type: "image",
                fileId,
                status: "saved",
                x: x - size.width / 2,
                y: y - size.height / 2,
                ...size,
              },
            ]),
          );
        } else {
          let upload = file;
          let dims = null;
          if (isVideo(file)) {
            setProgress({ label: "Preparing video", value: 0 });
            let prepared = null;
            try {
              prepared = await prepareVideo(file, (p) =>
                setProgress({ label: "Preparing video", value: p }),
              );
            } catch (e) {
              if (e instanceof VideoTooLongError) throw e;
              console.warn("Video conversion failed, using original", e);
            }
            if (prepared) {
              upload = prepared.blob;
              dims = prepared;
            } else if (tooBig(file)) {
              throw new Error(
                `it's over ${MAX_UPLOAD_MB} MB and this browser can't shrink it. Try adding it from another device.`,
              );
            }
          }
          const size = fitSize(dims || (await measureMedia(file)), isVideo(file) ? 520 : 360);
          const ext = upload === file ? fileExtension(file) : "mp4";
          const path = `media/${crypto.randomUUID()}.${ext}`;
          setProgress({ label: `Uploading ${isVideo(file) ? "video" : "GIF"}`, value: null });
          await backend.uploadFile(path, upload);
          const [base] = convertToExcalidrawElements([
            {
              type: "rectangle",
              x: x - size.width / 2,
              y: y - size.height / 2,
              ...size,
            },
          ]);
          created.push(
            ...restoreElements(
              [
                {
                  ...base,
                  type: "embeddable",
                  link: mediaLink(path),
                  strokeColor: "transparent",
                  backgroundColor: "transparent",
                  strokeWidth: 0,
                  roundness: null,
                  customData: { media: { path, mime: upload.type || file.type } },
                },
              ],
              null,
            ),
          );
        }
      } catch (e) {
        console.error(e);
        excalidraw.setToast({
          message: `Couldn't add "${file.name}": ${e.message}`,
          closable: true,
          duration: 8000,
        });
      } finally {
        setProgress(null);
        setBusyUploads((n) => n - 1);
      }
      x += 40;
      y += 40;
    }

    if (created.length) {
      excalidraw.updateScene({
        elements: [...excalidraw.getSceneElementsIncludingDeleted(), ...created],
        appState: {
          selectedElementIds: Object.fromEntries(created.map((el) => [el.id, true])),
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      setTimeout(enforce, 0);
    }
  }, [enforce]);

  // Intercept drops of videos/GIFs (Excalidraw would turn GIFs into still frames).
  const onDropCapture = (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.some((f) => isVideo(f) || isGif(f))) return;
    e.preventDefault();
    e.stopPropagation();
    const at = viewportCoordsToSceneCoords(
      { clientX: e.clientX, clientY: e.clientY },
      apiRef.current.getAppState(),
    );
    insertFiles(files, at);
  };

  const onPaste = (_data, event) => {
    const files = [...(event?.clipboardData?.files || [])];
    if (files.some((f) => isVideo(f) || isGif(f))) {
      insertFiles(files);
      return false;
    }
    return true;
  };

  // ---------- page numbers (by date) ----------

  const { numbers, order } = useMemo(
    () => orderPages(frames, Math.max(lastUsed + 2, spread + 1)),
    [frames, lastUsed, spread],
  );
  const pagesLabel = (n) => {
    const a = numbers.get(`${n}-L`);
    const b = numbers.get(`${n}-R`);
    const [lo, hi] = a < b ? [a, b] : [b, a];
    return hi === lo + 1 ? `${lo}–${hi}` : `${lo} & ${hi}`;
  };
  const orderPos = order.indexOf(spread);
  const prevSpread = orderPos > 0 ? order[orderPos - 1] : null;
  const nextSpread = orderPos >= 0 && orderPos < order.length - 1 ? order[orderPos + 1] : null;
  const currentMeta = pagesMeta(frames.find((f) => f.id === spreadId(spread)));

  /** Everything (drawings, text, photos, titles, dates) as one file. */
  const downloadBackup = () => {
    const ex = apiRef.current;
    if (!ex) return;
    const json = serializeAsJSON(
      ex.getSceneElements(),
      { ...ex.getAppState(), viewBackgroundColor: "#fffdf7" },
      ex.getFiles(),
      "local",
    );
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `our-notebook-${new Date().toISOString().slice(0, 10)}.excalidraw`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ex.setToast({
      message:
        "Backup downloaded. Videos and GIFs stay in Supabase and aren't inside the file.",
      closable: true,
      duration: 6000,
    });
  };

  // ---------- UI ----------

  const connectionLabel = {
    connecting: "Connecting…",
    live: backend.mode === "demo" ? "Demo · live" : "Live",
    reconnecting: "Reconnecting…",
    offline: "Offline",
  }[status];
  const saveLabel = {
    saved: "Saved",
    saving: "Saving…",
    error: "Not saved yet, will keep trying",
  }[saveState];
  const statusLabel = `${connectionLabel} · ${saveLabel}`;
  const statusClass = saveState === "error" ? "reconnecting" : status;

  const renderTopRightUI = (isMobile) => (
    <div className="top-right">
      <span className={`status status-${statusClass}`} title={statusLabel}>
        <i />
        {!isMobile && <span className="label">{statusLabel}</span>}
      </span>
      {/* On phones the toolbar is full, so this lives in the ☰ menu instead. */}
      {!isMobile && (
        <button
          className="add-media"
          onClick={() => fileInput.current?.click()}
          title="Add photos, GIFs or videos"
          aria-label="Add photos, GIFs or videos"
          disabled={busyUploads > 0}
        >
          <span className="icon" aria-hidden>
            {busyUploads > 0 ? "…" : "📷"}
          </span>
          <span className="label">
            {busyUploads > 0 ? "Uploading…" : "Photo / video / GIF"}
          </span>
        </button>
      )}
    </div>
  );

  return (
    <div className="notebook" onDropCapture={onDropCapture}>
      {progress && (
        <div className="progress-pill" role="status" aria-live="polite">
          <span>
            {progress.label}…
            {progress.value != null && ` ${Math.round(progress.value * 100)}%`}
          </span>
          <div className="bar">
            <div
              className={progress.value == null ? "indeterminate" : ""}
              style={progress.value != null ? { transform: `scaleX(${progress.value})` } : undefined}
            />
          </div>
          <small>Keep this page open until it's done</small>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          insertFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="desk">
      <div className="paper-spread" ref={paperRef} aria-hidden>
        <div className="paper-cover" />
        <div className="paper-page left">
          <span className="page-no">{numbers.get(`${spread}-L`)}</span>
        </div>
        <div className="paper-page right">
          <span className="page-no">{numbers.get(`${spread}-R`)}</span>
        </div>
      </div>
      <Excalidraw
        excalidrawAPI={setApi}
        initialData={initialData}
        onChange={onChange}
        onPointerUpdate={onPointerUpdate}
        onPointerUp={onPointerUp}
        onScrollChange={onScrollChange}
        onPaste={onPaste}
        isCollaborating
        name={NOTEBOOK_TITLE}
        renderTopRightUI={renderTopRightUI}
        validateEmbeddable={(link) => (link.includes(MEDIA_MARK) ? true : undefined)}
        renderEmbeddable={(el) =>
          el.customData?.media ? (
            <MediaEmbed media={el.customData.media} clip={paperClip(el)} />
          ) : null
        }
        UIOptions={{
          canvasActions: { loadScene: false, saveToActiveFile: false, clearCanvas: false },
        }}
      >
        <MainMenu>
          <MainMenu.Item onSelect={() => fileInput.current?.click()}>
            Add photo / video / GIF
          </MainMenu.Item>
          <MainMenu.Item onSelect={downloadBackup}>Download backup</MainMenu.Item>
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
          <MainMenu.Separator />
          <MainMenu.Item onSelect={() => backend.signOut()}>
            Sign out ({user.name})
          </MainMenu.Item>
        </MainMenu>
      </Excalidraw>

      <div className="page-headers" ref={headersRef}>
        {["L", "R"].map((side) => (
          <PageHeader
            key={`${spread}-${side}`}
            side={side}
            meta={currentMeta[side] || {}}
            onCommit={(patch) => updatePageMeta(spread, side, patch)}
          />
        ))}
      </div>

      <nav className="pager" aria-label="Turn pages">
        <button
          onClick={() => goToSpread(prevSpread)}
          disabled={prevSpread == null}
          aria-label="Previous pages"
        >
          ‹
        </button>
        <span className="pager-label">
          Pages {pagesLabel(spread)}
        </span>
        <button
          onClick={() => goToSpread(nextSpread)}
          disabled={nextSpread == null}
          aria-label="Next pages"
        >
          ›
        </button>
        {Object.entries(peerSpreads)
          .filter(([, p]) => p.spread !== spread)
          .map(([id, p]) => (
            <button key={id} className="peer-jump" onClick={() => goToSpread(p.spread)}>
              {p.name} is on pages {pagesLabel(p.spread)} →
            </button>
          ))}
      </nav>
      </div>
    </div>
  );
}
