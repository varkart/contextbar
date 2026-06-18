import { useRef, useCallback } from 'react';
import SearchBar from '../SearchBar';
import Header from '../Header';
import Footer from '../Footer';
import ToolRow from '../ToolRow';
import type { AiTool, Notification } from '../../types';
import type { ToolMatch } from '../../search';
import { useRovingFocus } from '../../useRovingFocus';

interface MainViewProps {
  query: string;
  setQuery: (q: string) => void;
  loading: boolean;
  tools: AiTool[];
  installedTools: AiTool[];
  searchResults: ToolMatch[];
  notifications: Notification[];
  updateInfo: any;
  lastUpdated: Date | null;
  cloudSyncing: boolean;
  onSelectTool: (tool: AiTool) => void;
  onFetchTools: () => Promise<void>;
  onGoTo: (view: any) => void;
}

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <div key={i} className="px-4 py-2.5 animate-pulse">
          <div className="flex items-center gap-2.5">
            <div className="w-[7px] h-[7px] rounded-full bg-[var(--c-skeleton)]" />
            <div className="w-[20px] h-[20px] rounded bg-[var(--c-skeleton)]" />
            <div className="h-3 bg-[var(--c-skeleton)] rounded w-28" />
          </div>
        </div>
      ))}
    </>
  )
}

export default function MainView({
  query,
  setQuery,
  loading,
  tools,
  installedTools,
  searchResults,
  notifications,
  updateInfo,
  lastUpdated,
  cloudSyncing,
  onSelectTool,
  onFetchTools,
  onGoTo
}: MainViewProps) {
  const navigableTools = searchResults.filter(r => r.tool.installed);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const { getItemProps, setFocusedIndex } = useRovingFocus({
    count: navigableTools.length,
    onSelect: (index) => {
      const tool = navigableTools[index]?.tool;
      if (tool) onSelectTool(tool);
    },
  });

  // When Tab is pressed in the search input, move focus to the first list item
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && !e.shiftKey && navigableTools.length > 0) {
      e.preventDefault();
      setFocusedIndex(0);
      // The roving focus hook will call focus() on next render — trigger it via getItemProps
      // by programmatically focusing: we need a small workaround since getItemProps creates refs
      // Instead, dispatch arrow-down equivalent by setting index 0 and focusing
      const firstItem = document.querySelector<HTMLElement>('[data-tool-list-item="0"]');
      firstItem?.focus();
    }
  }, [navigableTools.length, setFocusedIndex]);

  return (
    <>
      <Header
        onSettingsClick={() => onGoTo('settings')}
        onNotificationsClick={() => onGoTo('notifications')}
        updateAvailable={!!updateInfo}
        notificationCount={notifications.length}
      />
      <SearchBar
        value={query}
        onChange={setQuery}
        inputRef={searchInputRef}
        onKeyDown={handleSearchKeyDown}
      />
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--c-border-sub)]">
        {loading && tools.length === 0 ? (
          <SkeletonRows />
        ) : searchResults.length === 0 && query ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[14px] text-[var(--c-text-3)]">No results for "{query}"</p>
          </div>
        ) : !loading && installedTools.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--c-surface)] flex items-center justify-center mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                className="w-5 h-5 text-[var(--c-text-3)]">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <p className="text-[15px] font-semibold text-[var(--c-text)]">No AI tools detected</p>
            <p className="text-[13px] text-[var(--c-text-3)] leading-relaxed max-w-[240px]">
              Install Claude Code, Cursor, Gemini CLI, or GitHub Copilot and LLM Manager will pick them up automatically.
            </p>
          </div>
        ) : (
          searchResults.map(({ tool }) => {
            const navIdx = navigableTools.findIndex(r => r.tool.id === tool.id);
            const itemProps = navIdx >= 0 ? getItemProps(navIdx) : undefined;
            return (
              <ToolRow
                key={tool.id}
                tool={tool}
                onSelectTool={onSelectTool}
                tabIndex={itemProps?.tabIndex}
                onKeyDown={itemProps?.onKeyDown as React.KeyboardEventHandler<HTMLButtonElement> | undefined}
                rowRef={(el) => {
                  itemProps?.ref(el);
                  if (el && navIdx >= 0) el.setAttribute('data-tool-list-item', String(navIdx));
                }}
                onFocus={itemProps?.onFocus}
              />
            );
          })
        )}
      </div>
      <Footer lastUpdated={lastUpdated} onRefresh={onFetchTools} loading={loading} cloudSyncing={cloudSyncing} />
    </>
  );
}
