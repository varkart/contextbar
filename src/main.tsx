import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ExpandedApp from './expanded/ExpandedApp'
import './index.css'

// The same bundle serves both windows: the tray popover ("main") and the
// large app window ("expanded"). Branch on the Tauri window label.
function windowLabel(): string {
  try {
    const internals = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ as
      | { metadata?: { currentWebviewWindow?: { label?: string } } }
      | undefined
    return internals?.metadata?.currentWebviewWindow?.label ?? 'main'
  } catch {
    return 'main'
  }
}

const isExpanded = windowLabel() === 'expanded'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isExpanded ? <ExpandedApp /> : <App />}
  </React.StrictMode>,
)
