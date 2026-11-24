import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installGlobalErrorLogging } from './lib/logger'
import { installFastScroll } from './lib/fastScroll'

installGlobalErrorLogging()
const removeFastScroll = installFastScroll()
if (import.meta.hot) import.meta.hot.dispose(removeFastScroll)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
