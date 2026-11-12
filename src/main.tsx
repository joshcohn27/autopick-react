import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DRAFT_YEAR } from './config'

document.title = `Autopick - 1T8 Dynasty ${DRAFT_YEAR} Draft`

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
