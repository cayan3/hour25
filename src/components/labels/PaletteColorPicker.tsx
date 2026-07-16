import { useState } from 'react';
import { LABEL_PALETTE } from '../../lib/palette';
import { isLowContrast, contrastText } from '../../lib/color';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

interface PaletteColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  idPrefix: string;
}

// Curated 16-swatch palette first; custom hex lives behind an "advanced"
// disclosure with a non-blocking low-contrast warning (DESIGN.md §6).
export function PaletteColorPicker({ value, onChange, idPrefix }: PaletteColorPickerProps) {
  const isCustom = !LABEL_PALETTE.some((s) => s.hex.toLowerCase() === value.toLowerCase());
  const [advancedOpen, setAdvancedOpen] = useState(isCustom);
  const [customInput, setCustomInput] = useState(isCustom ? value : '');

  function handleCustomChange(next: string) {
    setCustomInput(next);
    if (HEX_RE.test(next)) onChange(next);
  }

  const lowContrast = HEX_RE.test(customInput) && isLowContrast(customInput);

  return (
    <div>
      <div role="group" aria-label="Label color" className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {LABEL_PALETTE.map((swatch) => {
          const selected = value.toLowerCase() === swatch.hex.toLowerCase();
          return (
            <button
              key={swatch.hex}
              type="button"
              aria-pressed={selected}
              aria-label={`${swatch.name.replace('-', ' ')} (${swatch.hex})${selected ? ', selected' : ''}`}
              onClick={() => onChange(swatch.hex)}
              className={`h-11 w-11 touch-manipulation rounded-full border-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-500 ${
                selected ? 'border-slate-900 dark:border-slate-50' : 'border-transparent'
              }`}
              style={{ backgroundColor: swatch.hex }}
            >
              {selected && (
                <span aria-hidden="true" style={{ color: contrastText(swatch.hex) }}>
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      <details
        className="mt-2"
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer text-sm text-slate-500 focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-slate-400">
          Advanced: custom color
        </summary>
        <div className="mt-2 flex items-center gap-2">
          <label htmlFor={`${idPrefix}-custom-hex`} className="sr-only">
            Custom hex color
          </label>
          <input
            id={`${idPrefix}-custom-hex`}
            type="text"
            placeholder="#4287f5"
            value={customInput}
            onChange={(e) => handleCustomChange(e.target.value)}
            className="w-28 rounded border border-slate-300 px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <span
            aria-hidden="true"
            className="h-6 w-6 rounded border border-slate-300 dark:border-slate-600"
            style={{ backgroundColor: HEX_RE.test(customInput) ? customInput : 'transparent' }}
          />
        </div>
        {lowContrast && (
          <p role="status" className="mt-1 text-sm text-amber-600 dark:text-amber-400">
            This color may be hard to read as text. You can still use it.
          </p>
        )}
      </details>
    </div>
  );
}
