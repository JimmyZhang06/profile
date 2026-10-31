import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { aiPlugin } from "./server/ai.mjs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiOrigin =
    process.env.LULI_API_ORIGIN ||
    env.LULI_API_ORIGIN ||
    "http://127.0.0.1:" + (process.env.API_PORT || env.API_PORT || 4175);
  return {
    build: {
      outDir: "dist/client",
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom/client",
        "@tiptap/react",
        "@tiptap/starter-kit",
      ],
    },
    server: {
      fs: {
        deny: [
          ".env",
          ".env.*",
          "*.{crt,pem}",
          "**/.git/**",
          "**/.data/**",
          "**/evidence/*.log",
        ],
      },
      proxy: {
        "/api/cloud": apiOrigin,
        "/api/auth": apiOrigin,
        "/api/admin": apiOrigin,
        "/api/setup": apiOrigin,
      },
      host: "127.0.0.1",
      allowedHosts: ["terminal.local"],
      warmup: {
        clientFiles: ["./src/main.jsx"],
      },
    },
    plugins: [react(), aiPlugin()],
  };
});
