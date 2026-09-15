import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App'
import { reportError } from './lib/analytics/events'
import './index.css'

window.addEventListener('error', (event) => {
  reportError(event.error ?? event.message, { source: 'window.error' })
})

window.addEventListener('unhandledrejection', (event) => {
  reportError(event.reason, { source: 'unhandledrejection' })
})

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found.')

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
