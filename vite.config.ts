import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // bind 0.0.0.0, not just localhost — required for the dev
                // server to be reachable when running inside a devcontainer,
                // Codespaces, or any remote VM (same reason the old
                // .devcontainer/devcontainer.json had to forward port 8501
                // for Streamlit).
  },
});
