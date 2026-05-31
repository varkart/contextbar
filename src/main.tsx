import "./instrument";

import React from 'react'
import ReactDOM from 'react-dom/client'
import posthog from 'posthog-js'
import { PostHogErrorBoundary, PostHogProvider } from '@posthog/react'
import { reactErrorHandler } from '@sentry/react'
import App from './App'
import './index.css'
import { initAnalytics } from './analytics'

initAnalytics()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement, {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
}).render(
  <React.StrictMode>
    <PostHogProvider client={posthog}>
      <PostHogErrorBoundary>
        <App />
      </PostHogErrorBoundary>
    </PostHogProvider>
  </React.StrictMode>,
)
