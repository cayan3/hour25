import { useThemeStore, type ThemePreference } from '../store/theme';

const LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT[theme])}
      aria-label={`Theme: ${LABELS[theme]}. Activate to change.`}
      className="motion-safe:transition-colors rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {LABELS[theme]}
    </button>
  );
}
