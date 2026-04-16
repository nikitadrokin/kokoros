import { defineConfig } from 'vite'

import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), TanStackRouterVite({ target: 'react' }), viteReact()],
})

export default config
