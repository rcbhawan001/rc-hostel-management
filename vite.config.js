import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      // Uploaded files live on the API (`express.static("/uploads")`), not on Vite.
      "/uploads": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});

