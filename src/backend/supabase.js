import { createClient } from "@supabase/supabase-js";
import { PEOPLE, anniversaryPassword } from "../config";

const BOARD = "main";
const BUCKET = "media";
const PAGE = 1000;

const personFor = (email) =>
  PEOPLE.find((p) => p.email.toLowerCase() === (email || "").toLowerCase());

const toUser = (u) =>
  u
    ? {
        id: u.id,
        email: u.email,
        name:
          personFor(u.email)?.name ||
          u.user_metadata?.name ||
          (u.email || "").split("@")[0],
      }
    : null;

export class WrongAnswerError extends Error {}

/**
 * Real backend: Supabase handles login, the saved notebook (Postgres),
 * photo/video storage, and the live channel for edits + cursors.
 */
export function createSupabaseBackend(url, anonKey) {
  const sb = createClient(url, anonKey);
  const signedUrlCache = new Map();

  return {
    mode: "supabase",

    async getUser() {
      const { data } = await sb.auth.getSession();
      return toUser(data.session?.user);
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) =>
        cb(toUser(session?.user)),
      );
      return () => data.subscription.unsubscribe();
    },

    /**
     * "When is our anniversary?" — the date is turned into a password and
     * tried against each person's account; whichever one accepts it is who
     * you are. The answers themselves never appear in the code.
     */
    async signInWithAnniversary(month, day) {
      const password = anniversaryPassword(month, day);
      for (const person of PEOPLE) {
        const { error } = await sb.auth.signInWithPassword({
          email: person.email,
          password,
        });
        if (!error) return;
        if (error.status === 429 || /rate limit/i.test(error.message)) {
          throw new Error("Too many tries. Take a breath and try again in a few minutes.");
        }
        if (!/invalid login credentials/i.test(error.message)) throw error;
      }
      throw new WrongAnswerError("That's not it.");
    },

    async signOut() {
      // Forget the cover photo kept on this device.
      try {
        await caches.delete("our-notebook");
      } catch {}
      await sb.auth.signOut();
    },

    async isMember() {
      const { data, error } = await sb.rpc("is_member");
      if (error) throw error;
      return data === true;
    },

    async loadElements() {
      const all = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb
          .from("elements")
          .select("data")
          .eq("board", BOARD)
          .order("id")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        all.push(...data.map((r) => r.data));
        if (data.length < PAGE) break;
      }
      return all;
    },

    async saveElements(elements) {
      if (!elements.length) return;
      const rows = elements.map((el) => ({
        board: BOARD,
        id: el.id,
        data: el,
        version: el.version,
        updated_at: new Date().toISOString(),
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb
          .from("elements")
          .upsert(rows.slice(i, i + 500), { onConflict: "board,id" });
        if (error) throw error;
      }
    },

    async uploadFile(path, blob) {
      const { error } = await sb.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: blob.type, upsert: true });
      if (error) throw error;
    },

    async downloadFile(path) {
      const { data, error } = await sb.storage.from(BUCKET).download(path);
      if (error) throw error;
      return data;
    },

    async getMediaUrl(path) {
      const hit = signedUrlCache.get(path);
      if (hit && hit.expires > Date.now()) return hit.url;
      const ttl = 60 * 60 * 6;
      const { data, error } = await sb.storage
        .from(BUCKET)
        .createSignedUrl(path, ttl);
      if (error) throw error;
      signedUrlCache.set(path, {
        url: data.signedUrl,
        expires: Date.now() + (ttl - 600) * 1000,
      });
      return data.signedUrl;
    },

    joinRoom({ clientId, user, onElements, onCursor, onPeers, onStatus, onReconnect }) {
      let joinedOnce = false;
      let channel = null;
      let closed = false;

      (async () => {
        await sb.realtime.setAuth();
        if (closed) return;
        channel = sb.channel(`board:${BOARD}`, {
          config: {
            private: true,
            broadcast: { self: false },
            presence: { key: clientId },
          },
        });
        channel
          .on("broadcast", { event: "elements" }, ({ payload }) =>
            onElements(payload.elements),
          )
          .on("broadcast", { event: "cursor" }, ({ payload }) => onCursor(payload))
          .on("presence", { event: "sync" }, () => {
            const state = channel.presenceState();
            onPeers(
              Object.entries(state)
                .filter(([key]) => key !== clientId)
                .map(([key, metas]) => ({ clientId: key, ...metas[0] })),
            );
          })
          .subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
              onStatus("live");
              await channel.track({ id: user.id, name: user.name, color: user.color });
              if (joinedOnce) onReconnect();
              joinedOnce = true;
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              onStatus("reconnecting");
            } else if (status === "CLOSED" && !closed) {
              onStatus("offline");
            }
          });
      })();

      const send = (event, payload) =>
        channel?.send({ type: "broadcast", event, payload });

      return {
        sendElements: (elements) => send("elements", { elements }),
        sendCursor: (cursor) => send("cursor", cursor),
        leave: () => {
          closed = true;
          if (channel) sb.removeChannel(channel);
        },
      };
    },
  };
}
