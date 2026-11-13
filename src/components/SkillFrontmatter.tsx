/** Name, description and other frontmatter fields shown above a skill file's body. */
export default function SkillFrontmatter({ fields }: { fields: [string, string][] }) {
  if (fields.length === 0) return null
  const get = (k: string) => fields.find(([key]) => key === k)?.[1]
  const name = get('name')
  const description = get('description')
  const others = fields.filter(([k]) => k !== 'name' && k !== 'description')
  return (
    <section aria-label="Skill details" className="mb-3 pb-3 border-b border-[var(--c-border)]">
      {name && <div className="text-[15px] font-semibold font-mono text-[var(--c-text)] break-words">{name}</div>}
      {description && (
        <p className="mt-1 text-[13px] text-[var(--c-text-2)] leading-relaxed whitespace-pre-line">{description}</p>
      )}
      {others.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px]">
          {others.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-mono text-[var(--c-text-3)]">{k}</dt>
              <dd className="text-[var(--c-text-2)] break-words min-w-0">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
