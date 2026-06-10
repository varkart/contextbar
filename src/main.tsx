import "./instrument";

import React from 'react'
import ReactDOM from 'react-dom/client'
import posthog from 'posthog-js'
import { PostHogErrorBoundary, PostHogProvider } from '@posthog/react'
import { reactErrorHandler } from '@sentry/react'
import App from './App'
import './index.css'
import { initAnalytics } from './analytics'
import { invoke } from '@tauri-apps/api/core'

initAnalytics()

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement, {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
})

root.render(
  <React.StrictMode>
    <PostHogProvider client={posthog}>
      <PostHogErrorBoundary>
        <App />
      </PostHogErrorBoundary>
    </PostHogProvider>
  </React.StrictMode>,
)

// Show window only after React has painted — eliminates white flash
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    invoke('show_window').catch(() => {})
  })
})
