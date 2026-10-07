import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  assetsInclude: ['**/*.glb'],
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          motion: ['motion'],
          three: ['three', 'meshline'],
          r3f: ['@react-three/fiber', '@react-three/drei', '@react-three/rapier'],
          charts: ['recharts'],
          icons: ['lucide-react', 'react-icons'],
          router: ['react-router'],
        },
      },
    },
  },
});
