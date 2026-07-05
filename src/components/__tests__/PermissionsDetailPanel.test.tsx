import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import PermissionsDetailPanel from '../PermissionsDetailPanel'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('../../analytics', () => ({ capture: vi.fn(), captureException: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
const mockInvoke = vi.mocked(invoke)

const mockPerms = {
  allow: ['Bash(npm:*)', 'WebSearch'],
  deny: ['Bash(rm:*)'],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'get_permissions') return Promise.resolve(mockPerms)
    return Promise.resolve(null)
  })
})

describe('PermissionsDetailPanel', () => {
  it('renders Permissions heading', () => {
    render(<PermissionsDetailPanel toolId="claude" onBack={vi.fn()} />)
    expect(screen.getByText('Permissions')).toBeInTheDocument()
  })

  it('renders tool name breadcrumb when provided', () => {
    render(<PermissionsDetailPanel toolId="claude" toolName="Claude Code" onBack={vi.fn()} />)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('omits breadcrumb when toolName not provided', () => {
    render(<PermissionsDetailPanel toolId="claude" onBack={vi.fn()} />)
    expect(screen.queryByText('Claude Code')).not.toBeInTheDocument()
  })

  it('back button calls onBack', () => {
    const onBack = vi.fn()
    render(<PermissionsDetailPanel toolId="claude" onBack={onBack} />)
    fireEvent.click(screen.getByLabelText('Back'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('calls get_permissions on mount', async () => {
    render(<PermissionsDetailPanel toolId="claude" onBack={vi.fn()} />)
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('get_permissions', { agentId: 'claude' }))
  })

  it('shows allow rules after load', async () => {
    render(<PermissionsDetailPanel toolId="claude" onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Bash(npm:*)')).toBeInTheDocument())
    expect(screen.getByText('WebSearch')).toBeInTheDocument()
  })

  it('shows deny rules after load', async () => {
    render(<PermissionsDetailPanel toolId="claude" onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Bash(rm:*)')).toBeInTheDocument())
  })

  it('shows total count in header', async () => {
    render(<PermissionsDetailPanel toolId="claude" onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
  })

  it('shows empty state when no rules', async () => {
    mockInvoke.mockResolvedValue({ allow: [], deny: [] })
    render(<PermissionsDetailPanel toolId="claude" onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('No custom rules')).toBeInTheDocument())
  })

  it('shows loading skeleton before data arrives', () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}))
    const { container } = render(<PermissionsDetailPanel toolId="claude" onBack={vi.fn()} />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('shows error when get_permissions fails', async () => {
    mockInvoke.mockRejectedValue('permission denied')
    render(<PermissionsDetailPanel toolId="claude" onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/permission denied/)).toBeInTheDocument())
  })

  it('remove rule button calls remove_permission_rule', async () => {
    render(<PermissionsDetailPanel toolId="claude" onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText('Remove Bash(npm:*)')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Remove Bash(npm:*)'))
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('remove_permission_rule', {
        agentId: 'claude', rule: 'Bash(npm:*)', section: 'allow',
      })
    )
  })

  it('add rule calls add_permission_rule', async () => {
    render(<PermissionsDetailPanel toolId="claude" onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByPlaceholderText(/Bash\(npm:\*\)/)).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/Bash\(npm:\*\)/), { target: { value: 'WebFetch(*)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('add_permission_rule', {
        agentId: 'claude', rule: 'WebFetch(*)', section: 'allow',
      })
    )
  })

  it('add rule disabled when input is empty', async () => {
    render(<PermissionsDetailPanel toolId="claude" onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled())
  })

  it('dismisses error on click', async () => {
    mockInvoke.mockRejectedValue('oops')
    render(<PermissionsDetailPanel toolId="claude" onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/oops/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '✕' }))
    expect(screen.queryByText(/oops/)).not.toBeInTheDocument()
  })

  it('section select defaults to allow', async () => {
    render(<PermissionsDetailPanel toolId="claude" onBack={vi.fn()} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('allow')
  })
})
