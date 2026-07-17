import { useThemeStore, type ThemePreference } from '../store/theme';

const LABELS: Record<ThemePreference, string> = {
  system: 'Auto',
  light: 'Light',
  dark: 'Dark',
};

// "Auto" + a monitor icon instead of "System" (Week 5 feedback): "System"
// next to a "Settings" nav tab read as app settings, not the device's
// light/dark preference. The tooltip spells out what it follows.
const TITLES: Record<ThemePreference, string> = {
  system: 'Theme: Auto — follows your device’s light/dark setting. Click to change.',
  light: 'Theme: Light. Click to change.',
  dark: 'Theme: Dark. Click to change.',
};

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const iconProps = {
  'aria-hidden': true,
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function SunIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...iconProps}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg {...iconProps}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8m-4-4v4" />
    </svg>
  );
}

const ICONS: Record<ThemePreference, () => JSX.Element> = {
  system: MonitorIcon,
  light: SunIcon,
  dark: MoonIcon,
};

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const Icon = ICONS[theme];

  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT[theme])}
      aria-label={TITLES[theme]}
      title={TITLES[theme]}
      className="motion-safe:transition-colors flex items-center gap-1.5 rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <Icon />
      {LABELS[theme]}
    </button>
  );
}
