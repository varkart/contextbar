import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { SessionEntry } from '../../types'
import SessionList from './SessionList'
import SessionDetail from './SessionDetail'

interface HistoryPanelProps {
  view: 'history' | 'history-detail'
  onNavigateDetail: () => void
}

export default function HistoryPanel({ view, onNavigateDetail }: HistoryPanelProps) {
  const [sessions, setSessions] = useState<SessionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSession, setSelectedSession] = useState<SessionEntry | null>(null)

  useEffect(() => {
    setLoading(true)
    invoke<SessionEntry[]>('list_sessions', { limit: 300, offset: 0 })
      .then(s => {
        setSessions(s)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleSelect = (session: SessionEntry) => {
    setSelectedSession(session)
    onNavigateDetail()
  }

  if (view === 'history-detail' && selectedSession) {
    return <SessionDetail session={selectedSession} />
  }

  return (
    <SessionList
      sessions={sessions}
      onSelect={handleSelect}
      loading={loading}
    />
  )
}
