import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Shared markdown block with the app's prose styling (same classes as the
 *  skill file viewer). */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[13px] text-[var(--c-text-2)] leading-relaxed overflow-x-hidden skill-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
