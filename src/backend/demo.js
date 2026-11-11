/**
 * Demo backend, used automatically when no Supabase keys are configured.
 * Tabs in the same browser sync with each other (BroadcastChannel) and
 * everything is kept in this browser only (localStorage + IndexedDB).
 * Handy for trying the notebook out before the real backend is set up.
 */

const ELEMENTS_KEY = "our-notebook-demo-elements";
const USER_KEY = "our-notebook-demo-user";

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("our-notebook-demo", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbOp(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", mode);
    const req = fn(tx.objectStore("files"));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(ELEMENTS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function createDemoBackend() {
  const authListeners = new Set();
  const objectUrls = new Map();

  const getUser = () => {
    try {
      return JSON.parse(sessionStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  };

  return {
    mode: "demo",

    async getUser() {
      return getUser();
    },

    onAuthChange(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },

    async signIn(name) {
      const user = { id: crypto.randomUUID(), name: name || "Guest", email: null };
      try {
        sessionStorage.setItem(USER_KEY, JSON.stringify(user));
      } catch {}
      authListeners.forEach((cb) => cb(user));
    },

    async signUp() {
      throw new Error("Not available in demo mode");
    },

    async signOut() {
      try {
        sessionStorage.removeItem(USER_KEY);
      } catch {}
      authListeners.forEach((cb) => cb(null));
    },

    async isMember() {
      return true;
    },

    async loadElements() {
      return Object.values(readStored());
    },

    async saveElements(elements) {
      const stored = readStored();
      for (const el of elements) {
        if (!stored[el.id] || stored[el.id].version <= el.version) stored[el.id] = el;
      }
      try {
        localStorage.setItem(ELEMENTS_KEY, JSON.stringify(stored));
      } catch (e) {
        console.warn("Demo storage full", e);
      }
    },

    async uploadFile(path, blob) {
      await idbOp("readwrite", (s) => s.put(blob, path));
    },

    async downloadFile(path) {
      const blob = await idbOp("readonly", (s) => s.get(path));
      if (!blob) throw new Error("File not found yet");
      return blob;
    },

    async getMediaUrl(path) {
      if (objectUrls.has(path)) return objectUrls.get(path);
      const blob = await this.downloadFile(path);
      const url = URL.createObjectURL(blob);
      objectUrls.set(path, url);
      return url;
    },

    joinRoom({ clientId, user, onElements, onCursor, onPeers, onStatus }) {
      const bc = new BroadcastChannel("our-notebook-demo");
      const peers = new Map();
      const me = { id: user.id, name: user.name, color: user.color };

      const emitPeers = () =>
        onPeers([...peers.entries()].map(([key, p]) => ({ clientId: key, ...p.info })));

      bc.onmessage = ({ data }) => {
        if (data.from === clientId) return;
        if (data.type === "elements") onElements(data.elements);
        else if (data.type === "cursor") onCursor(data.cursor);
        else if (data.type === "bye") {
          peers.delete(data.from);
          emitPeers();
        } else if (data.type === "hello" || data.type === "beat") {
          const isNew = !peers.has(data.from);
          peers.set(data.from, { info: data.info, seen: Date.now() });
          if (isNew) emitPeers();
          if (data.type === "hello") bc.postMessage({ type: "beat", from: clientId, info: me });
        }
      };

      bc.postMessage({ type: "hello", from: clientId, info: me });
      onStatus("live");

      const beat = setInterval(() => {
        bc.postMessage({ type: "beat", from: clientId, info: me });
        let changed = false;
        for (const [key, p] of peers) {
          if (Date.now() - p.seen > 6000) {
            peers.delete(key);
            changed = true;
          }
        }
        if (changed) emitPeers();
      }, 2000);

      const bye = () => bc.postMessage({ type: "bye", from: clientId });
      window.addEventListener("beforeunload", bye);

      return {
        sendElements: (elements) => bc.postMessage({ type: "elements", from: clientId, elements }),
        sendCursor: (cursor) => bc.postMessage({ type: "cursor", from: clientId, cursor }),
        leave: () => {
          bye();
          clearInterval(beat);
          window.removeEventListener("beforeunload", bye);
          bc.close();
        },
      };
    },
  };
}
