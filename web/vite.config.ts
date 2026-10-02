import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The app version shown in the footer comes from the root package.json.
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    // The API runs as a separate process; proxying keeps the browser on one origin.
    proxy: { "/api": "http://localhost:3001" },
  },
});
