import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Репозиторий на GitHub Pages отдаётся из подкаталога /splitly-web/,
  // поэтому пути к ресурсам должны быть относительными
  base: './',
})
