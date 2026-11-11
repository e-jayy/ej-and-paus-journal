import { createSupabaseBackend } from "./supabase";
import { createDemoBackend } from "./demo";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const backend =
  url && key && !url.includes("YOUR-PROJECT")
    ? createSupabaseBackend(url, key)
    : createDemoBackend();
