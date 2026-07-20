import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.wasm'],
  define: {
    // Marcatore di build, loggato all'avvio in main.tsx: serve a verificare a colpo
    // d'occhio (aprendo la console in produzione) quale commit/quando è stata fatta
    // la build effettivamente servita, invece di doverlo dedurre dagli hash dei chunk.
    // COMMIT_REF è impostata automaticamente da Netlify ad ogni build (SHA del commit
    // deployato); in locale (npm run dev/build) non è definita, da qui il fallback.
    __BUILD_INFO__: JSON.stringify({
      commit: process.env.COMMIT_REF || 'locale',
      time: new Date().toISOString(),
    }),
  },
})
