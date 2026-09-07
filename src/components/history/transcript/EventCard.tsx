import type { Step } from './model'

/** A skill invocation or MCP tool call — pulled out of the folded work block
 *  and shown as its own tinted card so these boundaries stand out. */
export default function EventCard({ step }: { step: Step }) {
  const skill = step.kind === 'skill'
  const accent = skill ? 'border-fuchsia-500' : 'border-teal-400'
  const bg = skill ? 'bg-fuchsia-500/[0.07]' : 'bg-teal-400/[0.07]'
  const chip = skill ? 'bg-fuchsia-500/15 text-fuchsia-400' : 'bg-teal-400/15 text-teal-300'

  return (
    <div className={`mt-1.5 border-l-2 ${accent} ${bg} rounded-r-[5px] px-2.5 py-1.5`}>
      <div className="flex items-center gap-1.5">
        <span className={`font-mono text-[8.5px] font-bold tracking-wide px-1.5 py-px rounded ${chip}`}>
          {skill ? 'SKILL' : `MCP · ${step.server}`}
        </span>
        <span className="font-mono text-[10.5px] text-[var(--c-text-2)]">
          {skill ? step.input : step.bareName}
        </span>
      </div>
      {!skill && step.input && (
        <div className="font-mono text-[10px] text-[var(--c-text-3)] mt-0.5">{step.input}</div>
      )}
      {step.output && (
        <div className={`font-mono text-[10px] mt-0.5 whitespace-pre-wrap break-all ${step.isError ? 'text-rose-400' : 'text-[var(--c-text-3)] opacity-80'}`}>
          {step.output}
        </div>
      )}
    </div>
  )
}
