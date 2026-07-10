import React from 'react'
import ReactDOM from 'react-dom/client'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import App from './App'
import ExpandedApp from './expanded/ExpandedApp'
import './index.css'

// The same bundle serves both windows: the tray popover ("main") and the
// large app window ("expanded"). Branch on the Tauri window label.
function windowLabel(): string {
  try {
    return getCurrentWebviewWindow().label
  } catch {
    // Not running inside Tauri (browser dev, tests) — treat as popover.
    return 'main'
  }
}

const isExpanded = windowLabel() === 'expanded'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isExpanded ? <ExpandedApp /> : <App />}
  </React.StrictMode>,
)
