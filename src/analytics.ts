import posthog from 'posthog-js'

// Telemetry disabled — re-enable by setting this to true and ensuring
// VITE_PUBLIC_POSTHOG_PROJECT_TOKEN + VITE_PUBLIC_POSTHOG_HOST are set.
const TELEMETRY_ENABLED = false

export function initAnalytics() {
  if (!TELEMETRY_ENABLED) return
  posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    defaults: '2026-01-30',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
  })
}

export function capture(event: string, properties?: Record<string, unknown>) {
  if (!TELEMETRY_ENABLED) return
  try {
    posthog.capture(event, properties)
  } catch { /* non-critical */ }
}

export function captureException(error: unknown) {
  if (!TELEMETRY_ENABLED) return
  try {
    posthog.captureException(error)
  } catch { /* non-critical */ }
}

export default posthog
