'use client';

import { useRef } from 'react';
import { useServerInsertedHTML } from 'next/navigation';

/**
 * Applies the dark theme before the first paint. `ThemeProvider` resolves the
 * theme (the `theme` key in localStorage, else the system preference) only
 * once the page's scripts run, so a server-rendered page would otherwise be
 * painted light and flip to dark afterwards. Keep in step with
 * `lib/hooks/use-theme.tsx`.
 *
 * Injected via `useServerInsertedHTML` so React 19 does not warn about a
 * `<script>` rendered inside the client tree (raw JSX scripts never execute
 * on client renders).
 */
const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export function ThemeInitScript() {
  const inserted = useRef(false);

  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
  });

  return null;
}
