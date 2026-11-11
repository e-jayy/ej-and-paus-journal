import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// On GitHub Pages the site lives at /<repo-name>/, so the build uses a relative base.
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    "process.env.IS_PREACT": JSON.stringify("false"),
  },
});
