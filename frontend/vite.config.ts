import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // One entry per path the API owns at its root — see BASE, PROFILE and WS in
    // src/api.ts. In production VITE_API_URL points at the backend directly and
    // none of this is involved.
    proxy: {
      "/metrics": "http://localhost:3000",
      "/profile": "http://localhost:3000",
      "/workspace": "http://localhost:3000",
    },
  },
});
