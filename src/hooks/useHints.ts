import { useState } from 'react';

const KEY_DISMISSED = 'agentbar:hints:dismissed';
const KEY_LAST_SHOWN = 'agentbar:hints:lastShown';
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

export function useHints() {
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem(KEY_DISMISSED) === '1'
  );

  const shouldShow = !dismissed && (() => {
    const last = localStorage.getItem(KEY_LAST_SHOWN);
    if (!last) return true;
    return Date.now() - parseInt(last, 10) > COOLDOWN_MS;
  })();

  const markShown = () => {
    localStorage.setItem(KEY_LAST_SHOWN, String(Date.now()));
  };

  const dismiss = () => {
    localStorage.setItem(KEY_DISMISSED, '1');
    setDismissed(true);
  };

  return { shouldShow, markShown, dismiss };
}
