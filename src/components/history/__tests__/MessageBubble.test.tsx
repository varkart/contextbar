import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import MessageBubble from '../MessageBubble'
import type { HistoryMessage, ContentBlock } from '../../../types'

function toolBlock(name: string): ContentBlock {
  return { blockType: 'tool_use', toolName: name, isError: false }
}
function textBlock(text: string): ContentBlock {
  return { blockType: 'text', text, isError: false }
}

describe('MessageBubble — within-message tool call grouping', () => {
  it('collapses 3+ consecutive tool_use blocks in one turn into a group summary', () => {
    const message: HistoryMessage = {
      role: 'assistant',
      content: [toolBlock('Read'), toolBlock('Edit'), toolBlock('Bash')],
    }
    render(<MessageBubble message={message} />)
    expect(screen.getByText('3 tool calls')).toBeInTheDocument()
    // Individual pills not shown until expanded
    expect(screen.queryByText('Read')).not.toBeInTheDocument()
  })

  it('renders 1-2 tool calls inline without a group wrapper', () => {
    const message: HistoryMessage = {
      role: 'assistant',
      content: [toolBlock('Read'), toolBlock('Edit')],
    }
    render(<MessageBubble message={message} />)
    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.queryByText(/tool calls/)).not.toBeInTheDocument()
  })

  it('a run broken up by text does not get grouped', () => {
    const message: HistoryMessage = {
      role: 'assistant',
      content: [toolBlock('Read'), toolBlock('Edit'), textBlock('checking now'), toolBlock('Bash')],
    }
    render(<MessageBubble message={message} />)
    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Bash')).toBeInTheDocument()
    expect(screen.queryByText(/tool calls/)).not.toBeInTheDocument()
  })
})
