import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import { resolve } from "path"
import { existsSync, readFileSync } from "fs"

// Read the server port from file (written by server/index.ts)
function getServerPort(): number {
  const portFilePath = resolve(__dirname, ".server-port")
  if (existsSync(portFilePath)) {
    const port = parseInt(readFileSync(portFilePath, "utf-8").trim())
    if (!isNaN(port)) {
      console.log(`📡 Using API server port from .server-port: ${port}`)
      return port
    }
  }
  console.log("⚠️  .server-port not found, using default port 3004")
  console.log("   Start the server first: bun run server/index.ts")
  return 3004
}

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3003,
    proxy: {
      "/api": {
        target: `http://localhost:${getServerPort()}`,
        changeOrigin: true,
        // Required for SSE streams
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            if (req.url?.includes("/stream")) {
              proxyReq.setHeader("Cache-Control", "no-cache")
              proxyReq.setHeader("Connection", "keep-alive")
            }
          })
        },
      },
    },
  },
  build: {
    target: "esnext",
  },
})
