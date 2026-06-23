import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import MainView from '../views/MainView'
import { mockClaudeTool } from '../../__tests__/fixtures'

const defaultProps = {
  loading: false,
  tools: [mockClaudeTool],
  installedTools: [mockClaudeTool],
  searchResults: [],
  notifications: [],
  updateInfo: null,
  lastUpdated: null,
  cloudSyncing: false,
  onFetchTools: vi.fn(),
  onGoTo: vi.fn(),
  onOpenLlmsList: vi.fn(),
  onOpenSkillsPage: vi.fn(),
  onOpenMcpsPage: vi.fn(),
}

function getTileButton(label: string) {
  return screen.getByText(label, { selector: 'span' }).closest('button')!
}

describe('MainView tile navigation', () => {
  it('clicking Coding Agents tile calls onOpenLlmsList with default', () => {
    const onOpenLlmsList = vi.fn()
    render(<MainView {...defaultProps} onOpenLlmsList={onOpenLlmsList} />)
    fireEvent.click(getTileButton('Coding Agents'))
    expect(onOpenLlmsList).toHaveBeenCalledTimes(1)
  })

  it('clicking Skills tile calls onOpenSkillsPage, not onOpenLlmsList', () => {
    const onOpenSkillsPage = vi.fn()
    const onOpenLlmsList = vi.fn()
    render(<MainView {...defaultProps} onOpenSkillsPage={onOpenSkillsPage} onOpenLlmsList={onOpenLlmsList} />)
    fireEvent.click(getTileButton('Skills'))
    expect(onOpenSkillsPage).toHaveBeenCalledTimes(1)
    expect(onOpenLlmsList).not.toHaveBeenCalled()
  })

  it('clicking MCPs tile calls onOpenMcpsPage, not onOpenLlmsList', () => {
    const onOpenMcpsPage = vi.fn()
    const onOpenLlmsList = vi.fn()
    render(<MainView {...defaultProps} onOpenMcpsPage={onOpenMcpsPage} onOpenLlmsList={onOpenLlmsList} />)
    fireEvent.click(getTileButton('MCPs'))
    expect(onOpenMcpsPage).toHaveBeenCalledTimes(1)
    expect(onOpenLlmsList).not.toHaveBeenCalled()
  })

  it('renders all three tile labels', () => {
    render(<MainView {...defaultProps} />)
    expect(screen.getByText('Coding Agents', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('Skills', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('MCPs', { selector: 'span' })).toBeInTheDocument()
  })
})
