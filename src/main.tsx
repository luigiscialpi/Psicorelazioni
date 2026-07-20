import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/index.css'
import App from './components/pages/App'

// Marcatore di build sempre visibile in console: permette di verificare subito
// (in produzione o in locale) quale commit/build è effettivamente in esecuzione,
// senza dover risalire dagli hash dei file negli asset.
console.info('[PsicoRelazioni] Build:', __BUILD_INFO__)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
