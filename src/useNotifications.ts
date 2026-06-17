import { useState, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { Notification } from './types'

export interface UseNotificationsResult {
  notifications: Notification[]
  fetchNotifications: () => Promise<void>
}

export function useNotifications(): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([])

  const fetchNotifications = useCallback(async () => {
    try {
      const result = await invoke<Notification[]>('get_notifications')
      setNotifications(result)
    } catch {
      // DB may not be available; silently ignore
    }
  }, [])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  useEffect(() => {
    const unlisten = listen('notifications-changed', fetchNotifications)
    return () => { unlisten.then(fn => fn()) }
  }, [fetchNotifications])

  return { notifications, fetchNotifications }
}
