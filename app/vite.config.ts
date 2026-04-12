import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackRouter } from '@tanstack/router-plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  base: './',
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  resolve: { tsconfigPaths: true },
  server: {
    port: 3000,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    viteReact(),
  ],
})

export default config
