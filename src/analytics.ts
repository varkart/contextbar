import posthog from 'posthog-js'

export function initAnalytics() {
  posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    defaults: '2026-01-30',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
  })
}

export function capture(event: string, properties?: Record<string, unknown>) {
  try {
    posthog.capture(event, properties)
  } catch { /* non-critical */ }
}

export function captureException(error: unknown) {
  try {
    posthog.captureException(error)
  } catch { /* non-critical */ }
}

export default posthog
