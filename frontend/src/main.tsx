import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { ToastProvider } from './context/ToastContext.tsx'

// SIRI-UX-447: React Router v6 future flags to opt into v7 behaviour early and
// suppress migration warnings that appear in tests and dev console.
const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={routerFuture}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
