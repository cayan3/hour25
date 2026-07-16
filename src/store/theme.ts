import { create } from 'zustand';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme'; // must match the inline pre-paint script in index.html
const THEME_COLOR_LIGHT = '#f8fafc';
const THEME_COLOR_DARK = '#0f172a';

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveIsDark(theme: ThemePreference): boolean {
  return theme === 'dark' || (theme === 'system' && systemPrefersDark());
}

function applyTheme(theme: ThemePreference): void {
  const isDark = resolveIsDark(theme);
  document.documentElement.classList.toggle('dark', isDark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
}

function readStoredTheme(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'dark' || stored === 'light' ? stored : 'system';
}

interface ThemeState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
}));

// The inline head script already set the `dark` class pre-paint; this syncs
// the theme-color meta tag to match on load, and keeps 'system' mode tracking
// OS-level changes while the app is open.
applyTheme(useThemeStore.getState().theme);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (useThemeStore.getState().theme === 'system') applyTheme('system');
});
