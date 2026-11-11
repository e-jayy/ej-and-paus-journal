import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
  convertToExcalidrawElements,
  getSceneVersion,
  reconcileElements,
  restoreElements,
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
  lastUsedSpread,
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
const BROADCAST_MS = 80;
const CURSOR_MS = 60;
const SAVE_MS = 800;

// Videos and GIFs live on the page as "embeddable" elements whose link points
// back here; renderEmbeddable swaps the iframe for a real <video>/<img>.
const MEDIA_MARK = "#media/";
const mediaLink = (path) =>
  `${window.location.origin}${window.location.pathname}${MEDIA_MARK}${path}`;

function MediaEmbed({ media }) {
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
    return <video className="media-fill" src={src} controls playsInline loop preload="metadata" />;
  }
  return <img className="media-fill" src={src} alt="" draggable={false} />;
}

export default function Notebook({ user }) {
  const [api, setApi] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [busyUploads, setBusyUploads] = useState(0);
  const [progress, setProgress] = useState(null); // { label, value: 0..1 | null }
  const fileInput = useRef(null);

  // Which two-page spread is open (0 = pages 1–2).
  const [spread, setSpread] = useState(0);
  const [lastUsed, setLastUsed] = useState(-1);
  const [peerSpreads, setPeerSpreads] = useState({}); // clientId -> { name, spread }
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
    fetching: new Set(),
    collaborators: new Map(),
    lastCursor: 0,
    cursorTimer: null,
  });

  // ---------- loading ----------

  const initialData = useMemo(
    () =>
      backend.loadElements().then((loaded) => {
        const s = sync.current;
        for (const el of loaded) {
          s.versions.set(el.id, el.version);
          if (el.fileId) s.knownFiles.add(el.fileId);
        }
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
    el.style.setProperty("--z", zoom);
    el.style.transform = `translate(${(r.x + scrollX) * zoom}px, ${(r.y + scrollY) * zoom}px)`;
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
    const fixed = enforcePages(all, spreadRef.current);
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
    try {
      await backend.saveElements(batch);
    } catch (e) {
      console.error("Save failed, will retry", e);
      for (const el of batch) if (!s.toSave.has(el.id)) s.toSave.set(el.id, el);
      s.saveTimer = setTimeout(flushSave, 3000);
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

      const last = lastUsedSpread(elements);
      if (last !== lastUsedRef.current) {
        lastUsedRef.current = last;
        setLastUsed(last);
      }

      let changed = false;
      for (const el of elements) {
        if (s.versions.get(el.id) !== el.version) {
          s.versions.set(el.id, el.version);
          s.toBroadcast.set(el.id, el);
          s.toSave.set(el.id, el);
          changed = true;
        }
      }
      if (!changed) return;
      if (!s.broadcastTimer) s.broadcastTimer = setTimeout(flushBroadcast, BROADCAST_MS);
      clearTimeout(s.saveTimer);
      s.saveTimer = setTimeout(flushSave, SAVE_MS);
    },
    [flushBroadcast, flushSave, uploadImageFile, enforce],
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
      s.sceneVersion = getSceneVersion(reconciled);
      excalidraw.updateScene({
        elements: reconciled,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      fetchMissingFiles(remote);
    },
    [fetchMissingFiles],
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
      onReconnect: () => backend.loadElements().then(applyRemoteElements).catch(console.error),
    });
    room.current = r;

    const flushOnHide = () => {
      if (document.visibilityState === "hidden") flushSave();
    };
    document.addEventListener("visibilitychange", flushOnHide);
    window.addEventListener("beforeunload", flushSave);

    return () => {
      flushSave();
      r.leave();
      room.current = null;
      document.removeEventListener("visibilitychange", flushOnHide);
      window.removeEventListener("beforeunload", flushSave);
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

  // ---------- UI ----------

  const statusLabel = {
    connecting: "Connecting…",
    live: backend.mode === "demo" ? "Demo · live" : "Live",
    reconnecting: "Reconnecting…",
    offline: "Offline",
  }[status];

  const renderTopRightUI = (isMobile) => (
    <div className="top-right">
      <span className={`status status-${status}`} title={statusLabel}>
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
          <span className="page-no">{2 * spread + 1}</span>
        </div>
        <div className="paper-page right">
          <span className="page-no">{2 * spread + 2}</span>
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
          el.customData?.media ? <MediaEmbed media={el.customData.media} /> : null
        }
        UIOptions={{
          canvasActions: { loadScene: false, saveToActiveFile: false, clearCanvas: false },
        }}
      >
        <MainMenu>
          <MainMenu.Item onSelect={() => fileInput.current?.click()}>
            Add photo / video / GIF
          </MainMenu.Item>
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
          <MainMenu.Separator />
          <MainMenu.Item onSelect={() => backend.signOut()}>
            Sign out ({user.name})
          </MainMenu.Item>
        </MainMenu>
      </Excalidraw>

      <nav className="pager" aria-label="Turn pages">
        <button
          onClick={() => goToSpread(spread - 1)}
          disabled={spread === 0}
          aria-label="Previous pages"
        >
          ‹
        </button>
        <span className="pager-label">
          Pages {2 * spread + 1}–{2 * spread + 2}
        </span>
        <button
          onClick={() => goToSpread(spread + 1)}
          disabled={spread >= lastUsed + 1}
          aria-label="Next pages"
        >
          ›
        </button>
        {Object.entries(peerSpreads)
          .filter(([, p]) => p.spread !== spread)
          .map(([id, p]) => (
            <button key={id} className="peer-jump" onClick={() => goToSpread(p.spread)}>
              {p.name} is on pages {2 * p.spread + 1}–{2 * p.spread + 2} →
            </button>
          ))}
      </nav>
      </div>
    </div>
  );
}
