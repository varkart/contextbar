import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import MainView from '../views/MainView'
import { mockClaudeAgent } from '../../__tests__/fixtures'

const defaultProps = {
  loading: false,
  agents: [mockClaudeAgent],
  installedAgents: [mockClaudeAgent],
  searchResults: [],
  notifications: [],
  updateInfo: null,
  lastUpdated: null,
  cloudSyncing: false,
  onFetchAgents: vi.fn(),
  onGoTo: vi.fn(),
  onOpenAgentsList: vi.fn(),
  onOpenSkillsPage: vi.fn(),
  onOpenMcpsPage: vi.fn(),
}

function getTileButton(label: string) {
  return screen.getByText(label, { selector: 'span' }).closest('button')!
}

describe('MainView tile navigation', () => {
  it('clicking Coding Agents tile calls onOpenAgentsList with default', () => {
    const onOpenAgentsList = vi.fn()
    render(<MainView {...defaultProps} onOpenAgentsList={onOpenAgentsList} />)
    fireEvent.click(getTileButton('Coding Agents'))
    expect(onOpenAgentsList).toHaveBeenCalledTimes(1)
  })

  it('clicking Skills tile calls onOpenSkillsPage, not onOpenAgentsList', () => {
    const onOpenSkillsPage = vi.fn()
    const onOpenAgentsList = vi.fn()
    render(<MainView {...defaultProps} onOpenSkillsPage={onOpenSkillsPage} onOpenAgentsList={onOpenAgentsList} />)
    fireEvent.click(getTileButton('Skills'))
    expect(onOpenSkillsPage).toHaveBeenCalledTimes(1)
    expect(onOpenAgentsList).not.toHaveBeenCalled()
  })

  it('clicking MCPs tile calls onOpenMcpsPage, not onOpenAgentsList', () => {
    const onOpenMcpsPage = vi.fn()
    const onOpenAgentsList = vi.fn()
    render(<MainView {...defaultProps} onOpenMcpsPage={onOpenMcpsPage} onOpenAgentsList={onOpenAgentsList} />)
    fireEvent.click(getTileButton('MCPs'))
    expect(onOpenMcpsPage).toHaveBeenCalledTimes(1)
    expect(onOpenAgentsList).not.toHaveBeenCalled()
  })

  it('renders all three tile labels', () => {
    render(<MainView {...defaultProps} />)
    expect(screen.getByText('Coding Agents', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('Skills', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('MCPs', { selector: 'span' })).toBeInTheDocument()
  })
})
