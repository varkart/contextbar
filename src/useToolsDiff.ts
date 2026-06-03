import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'

interface DiffItem {
  toolName: string
  itemName: string
}

interface ToolsDiff {
  addedSkills: DiffItem[]
  removedSkills: DiffItem[]
  addedMcps: DiffItem[]
  removedMcps: DiffItem[]
}

export function useToolsDiff() {
  useEffect(() => {
    let unlisten: (() => void) | null = null

    listen<ToolsDiff>('tools-diff', async (event) => {
      const diff = event.payload
      const changes = [
        ...diff.addedSkills.map(i => `${i.toolName}: skill "${i.itemName}" added`),
        ...diff.addedMcps.map(i => `${i.toolName}: MCP "${i.itemName}" added`),
        ...diff.removedSkills.map(i => `${i.toolName}: skill "${i.itemName}" removed`),
        ...diff.removedMcps.map(i => `${i.toolName}: MCP "${i.itemName}" removed`),
      ]

      if (changes.length === 0) return

      // Import dynamically to avoid breaking in browser/test env
      try {
        const { sendNotification } = await import('@tauri-apps/plugin-notification')
        if (changes.length === 1) {
          await sendNotification({ title: 'aicontextbar', body: changes[0] })
        } else {
          await sendNotification({
            title: 'aicontextbar',
            body: `${changes.length} changes detected`,
          })
        }
      } catch {
        // Notification permission denied or not available — silent
      }
    }).then(fn => { unlisten = fn })

    return () => { unlisten?.() }
  }, [])
}
