import { describe, it, expect } from 'vitest'
import { splitFrontmatter } from '../skillFrontmatter'

describe('splitFrontmatter', () => {
  it('reads plain, quoted, folded, literal, wrapped and list values', () => {
    const { fields, body } = splitFrontmatter([
      '---',
      'name: "my-skill"',
      'description: Does a thing:',
      '  with a wrapped line',
      'notes: |',
      '  line one',
      '  line two',
      'summary: >-',
      '  folded',
      '  text',
      'allowed-tools:',
      '  - Read',
      '  - Bash',
      'tags: [a, "b"]',
      'empty:',
      '---',
      '',
      '# Body',
    ].join('\n'))
    expect(fields).toEqual([
      ['name', 'my-skill'],
      ['description', 'Does a thing: with a wrapped line'],
      ['notes', 'line one\nline two'],
      ['summary', 'folded text'],
      ['allowed-tools', 'Read, Bash'],
      ['tags', 'a, b'],
    ])
    expect(body).toBe('# Body')
  })

  it('leaves files without (closed) frontmatter alone', () => {
    expect(splitFrontmatter('# Hi')).toEqual({ fields: [], body: '# Hi' })
    expect(splitFrontmatter('---\nname: x\nno end')).toEqual({ fields: [], body: '---\nname: x\nno end' })
  })

  it('handles CRLF and a BOM', () => {
    const r = splitFrontmatter('\uFEFF---\r\nname: x\r\n---\r\nbody')
    expect(r.fields).toEqual([['name', 'x']])
    expect(r.body).toBe('body')
  })
})
