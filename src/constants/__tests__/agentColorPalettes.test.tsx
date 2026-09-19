import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { agentColor } from '../agentColors'
import { PALETTES, getPaletteIndex, setPaletteIndex, usePaletteIndex } from '../agentColorPalettes'

beforeEach(() => {
  localStorage.clear()
  setPaletteIndex(0)
})

describe('agent color palette override', () => {
  it('defaults to the Default palette, matching AGENT_COLORS', () => {
    expect(getPaletteIndex()).toBe(0)
    expect(agentColor('claude').hex).toBe(PALETTES[0].colors[0])
  })

  it('agentColor() reflects a non-default palette once selected', () => {
    const oceanIdx = PALETTES.findIndex(p => p.name === 'Ocean')
    setPaletteIndex(oceanIdx)
    expect(agentColor('claude').hex).toBe(PALETTES[oceanIdx].colors[0])
    expect(agentColor('codex').hex).toBe(PALETTES[oceanIdx].colors[3])
  })

  it('keeps the label and Tailwind badge classes unchanged — only hex is overridden', () => {
    setPaletteIndex(PALETTES.findIndex(p => p.name === 'Vibrant rainbow'))
    const c = agentColor('claude')
    expect(c.label).toBe('Claude')
    expect(c.bg).toBe('bg-orange-500/10')
  })

  it('persists the selection across a reload (localStorage)', () => {
    const idx = PALETTES.findIndex(p => p.name === 'Sunset')
    setPaletteIndex(idx)
    expect(localStorage.getItem('agent_color_palette_v1')).toBe(String(idx))
  })

  it('leaves unknown agent ids to their existing hash-based fallback', () => {
    setPaletteIndex(PALETTES.findIndex(p => p.name === 'Forest'))
    const before = agentColor('some-future-agent').hex
    setPaletteIndex(0)
    expect(agentColor('some-future-agent').hex).toBe(before)
  })

  function Probe() {
    const idx = usePaletteIndex()
    return <span>palette-{idx}</span>
  }

  it('usePaletteIndex() re-renders subscribers when the palette changes', () => {
    render(<Probe />)
    expect(screen.getByText('palette-0')).toBeInTheDocument()
    act(() => setPaletteIndex(2))
    expect(screen.getByText('palette-2')).toBeInTheDocument()
  })
})
