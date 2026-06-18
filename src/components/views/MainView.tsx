import Header from '../Header';
import Footer from '../Footer';
import type { AiTool, Notification } from '../../types';
import type { ToolMatch } from '../../search';
import type { LlmsListMode } from '../../useViewRouter';
import { TOOL_COLORS } from '../../constants/toolColors';

interface MainViewProps {
  loading: boolean;
  tools: AiTool[];
  installedTools: AiTool[];
  searchResults: ToolMatch[];
  notifications: Notification[];
  updateInfo: any;
  lastUpdated: Date | null;
  cloudSyncing: boolean;
  onFetchTools: () => Promise<void>;
  onGoTo: (view: any) => void;
  onOpenLlmsList: (mode: LlmsListMode) => void;
}

function ChevronRight() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="w-4 h-4 text-[var(--c-text-3)] flex-shrink-0">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ToolDots({ tools }: { tools: AiTool[] }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {tools.map(t => {
        const colors = TOOL_COLORS[t.id] ?? { bg: 'bg-zinc-500/10', text: 'text-zinc-500' };
        return (
          <span
            key={t.id}
            className={`inline-flex items-center justify-center w-[22px] h-[22px] rounded text-[11px] font-bold flex-shrink-0 ${colors.bg} ${colors.text}`}
            title={t.name}
          >
            {t.name[0].toUpperCase()}
          </span>
        );
      })}
    </div>
  );
}

export default function MainView({
  loading,
  installedTools,
  notifications,
  updateInfo,
  lastUpdated,
  cloudSyncing,
  onFetchTools,
  onGoTo,
  onOpenLlmsList,
}: MainViewProps) {
  const totalSkills = installedTools.reduce((n, t) => n + t.skills.length, 0);
  const activeSkills = installedTools.reduce((n, t) => n + t.skills.filter(s => s.active).length, 0);
  const totalMcps = installedTools.reduce((n, t) => n + t.mcps.length, 0);
  const activeMcps = installedTools.reduce((n, t) => n + t.mcps.filter(m => m.active).length, 0);

  return (
    <>
      <Header
        onSettingsClick={() => onGoTo('settings')}
        onNotificationsClick={() => onGoTo('notifications')}
        updateAvailable={!!updateInfo}
        notificationCount={notifications.length}
      />

      <div className="flex-1 overflow-y-auto flex flex-col gap-3 p-3">
        {/* LLMs tile — full width */}
        <button
          onClick={() => onOpenLlmsList('default')}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[var(--c-surface)] hover:bg-[var(--c-hover)] border border-[var(--c-border-sub)] transition-colors text-left group"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[13px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider">LLMs</span>
              <span className="text-[12px] text-[var(--c-text-3)] tabular-nums">
                {loading ? '…' : `${installedTools.length} installed`}
              </span>
            </div>
            {!loading && installedTools.length > 0 ? (
              <ToolDots tools={installedTools} />
            ) : !loading ? (
              <span className="text-[13px] text-[var(--c-text-3)]">No tools detected</span>
            ) : (
              <div className="flex gap-1.5">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-[22px] h-[22px] rounded bg-[var(--c-skeleton)] animate-pulse" />
                ))}
              </div>
            )}
          </div>
          <ChevronRight />
        </button>

        {/* Skills + MCPs row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Skills tile */}
          <button
            onClick={() => onOpenLlmsList('skills')}
            className="flex flex-col gap-2 px-4 py-3.5 rounded-xl bg-[var(--c-surface)] hover:bg-[var(--c-hover)] border border-[var(--c-border-sub)] transition-colors text-left group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider">Skills</span>
              <ChevronRight />
            </div>
            {loading ? (
              <div className="h-7 w-10 bg-[var(--c-skeleton)] rounded animate-pulse" />
            ) : (
              <>
                <span className="text-[28px] font-bold text-[var(--c-text)] leading-none tabular-nums">{totalSkills}</span>
                <span className="text-[12px] text-[var(--c-text-3)]">{activeSkills} active</span>
              </>
            )}
          </button>

          {/* MCPs tile */}
          <button
            onClick={() => onOpenLlmsList('mcps')}
            className="flex flex-col gap-2 px-4 py-3.5 rounded-xl bg-[var(--c-surface)] hover:bg-[var(--c-hover)] border border-[var(--c-border-sub)] transition-colors text-left group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[var(--c-text-3)] uppercase tracking-wider">MCPs</span>
              <ChevronRight />
            </div>
            {loading ? (
              <div className="h-7 w-10 bg-[var(--c-skeleton)] rounded animate-pulse" />
            ) : (
              <>
                <span className="text-[28px] font-bold text-[var(--c-text)] leading-none tabular-nums">{totalMcps}</span>
                <span className="text-[12px] text-[var(--c-text-3)]">{activeMcps} active</span>
              </>
            )}
          </button>
        </div>
      </div>

      <Footer lastUpdated={lastUpdated} onRefresh={onFetchTools} loading={loading} cloudSyncing={cloudSyncing} />
    </>
  );
}
