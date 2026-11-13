import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const INLINE = ['p', 'strong', 'em', 'code', 'del', 'a']

/** Renders one line of inline markdown (bold, italic, code, strike, links)
 *  as plain inline elements, for list previews. Links show as text only. */
export default function InlineMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      allowedElements={INLINE}
      unwrapDisallowed
      components={{
        p: ({ children }) => <>{children}</>,
        strong: ({ children }) => <strong className="font-semibold text-[var(--c-text-2)]">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children }) => <code className="font-mono text-[0.95em] px-1 rounded bg-[var(--c-surface-2)]">{children}</code>,
        del: ({ children }) => <del className="line-through">{children}</del>,
        a: ({ children }) => <span className="underline underline-offset-2">{children}</span>,
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
