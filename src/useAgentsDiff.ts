import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'

interface DiffItem {
  toolName: string
  itemName: string
}

interface AgentsDiff {
  addedSkills: DiffItem[]
  removedSkills: DiffItem[]
  addedMcps: DiffItem[]
  removedMcps: DiffItem[]
}

export function useAgentsDiff() {
  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | null = null

    ;(async () => {
      unlisten = await listen<AgentsDiff>('agents-diff', async (event) => {
        const diff = event.payload
        const changes = [
          ...diff.addedSkills.map(i => `${i.toolName}: skill "${i.itemName}" added`),
          ...diff.addedMcps.map(i => `${i.toolName}: MCP "${i.itemName}" added`),
          ...diff.removedSkills.map(i => `${i.toolName}: skill "${i.itemName}" removed`),
          ...diff.removedMcps.map(i => `${i.toolName}: MCP "${i.itemName}" removed`),
        ]

        if (changes.length === 0) return

        try {
          const { sendNotification } = await import('@tauri-apps/plugin-notification')
          if (changes.length === 1) {
            await sendNotification({ title: 'Context Bar', body: changes[0] })
          } else {
            await sendNotification({
              title: 'Context Bar',
              body: `${changes.length} changes detected`,
            })
          }
        } catch {
          // Notification permission denied or not available — silent
        }
      })
      // If cleanup ran before the await resolved, unregister immediately
      if (cancelled) unlisten()
    })()

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])
}
