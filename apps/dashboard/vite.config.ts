import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import { resolve } from "path"
import { existsSync, readFileSync } from "fs"

function getServerPort(): number {
  const portFilePath = resolve(__dirname, ".server-port")
  if (existsSync(portFilePath)) {
    const port = parseInt(readFileSync(portFilePath, "utf-8").trim())
    if (!isNaN(port)) return port
  }
  return 3010
}

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3005,
    proxy: {
      "/api": {
        target: `http://localhost:${getServerPort()}`,
        changeOrigin: true,
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
