import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src',
  base: '/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        cpu: 'src/index.html',
        gpu: 'src/gpu.html',
      },
    },
  },
})
