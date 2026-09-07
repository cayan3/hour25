import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExportPanel } from '../../src/components/settings/ExportPanel';

vi.mock('../../src/lib/supabase', () => ({ supabase: { auth: {} } }));

const getEarliestEntryDate = vi.fn();
const getLatestEntryDate = vi.fn();
const getEntriesForRange = vi.fn();
vi.mock('../../src/lib/db/entries', () => ({
  getEarliestEntryDate: (...args: unknown[]) => getEarliestEntryDate(...args),
  getLatestEntryDate: (...args: unknown[]) => getLatestEntryDate(...args),
  getEntriesForRange: (...args: unknown[]) => getEntriesForRange(...args),
}));

const listAllLabels = vi.fn();
vi.mock('../../src/lib/db/labels', () => ({
  listAllLabels: (...args: unknown[]) => listAllLabels(...args),
}));

const listCategories = vi.fn();
vi.mock('../../src/lib/db/categories', () => ({
  listCategories: (...args: unknown[]) => listCategories(...args),
}));

const getSettings = vi.fn();
vi.mock('../../src/lib/db/settings', () => ({
  getSettings: (...args: unknown[]) => getSettings(...args),
}));

const listPendingWrites = vi.fn();
vi.mock('../../src/lib/offline/queue', () => ({
  listPendingWrites: (...args: unknown[]) => listPendingWrites(...args),
}));

const downloadTextFile = vi.fn();
vi.mock('../../src/lib/download', () => ({
  downloadTextFile: (...args: unknown[]) => downloadTextFile(...args),
}));

const USER = 'user-1';

const SETTINGS = {
  id: 'settings-1',
  user_id: USER,
  timezone: 'UTC',
  sleep_start: 46,
  sleep_end: 14,
  sleep_label_id: 'l1',
  chunk_minutes: 30,
  target_minutes_day: null,
  dashboard_config: null,
  theme: 'system',
  onboarded_at: '2026-03-01T00:00:00.000Z',
  created_at: '2026-03-01T00:00:00.000Z',
};

function setOnline(online: boolean) {
  return vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(online);
}

let onLineSpy: ReturnType<typeof setOnline> | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  getEarliestEntryDate.mockResolvedValue('2026-07-01');
  getLatestEntryDate.mockResolvedValue('2026-07-01');
  getEntriesForRange.mockResolvedValue([
    { date: '2026-07-01', slotIndex: 0, labelId: 'l1', note: null, chunkMinutes: 30 },
  ]);
  listPendingWrites.mockResolvedValue([]);
  listAllLabels.mockResolvedValue([
    { id: 'l1', name: 'sleep', color: '#004972', category_id: null, deleted_at: null },
  ]);
  listCategories.mockResolvedValue([]);
  getSettings.mockResolvedValue(SETTINGS);
});

afterEach(() => {
  onLineSpy?.mockRestore();
  onLineSpy = null;
  window.history.replaceState({}, '', '/');
});

describe('ExportPanel', () => {
  it('downloads a JSON backup when online', async () => {
    onLineSpy = setOnline(true);
    render(<ExportPanel userId={USER} />);

    const button = screen.getByRole('button', { name: /download backup/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(screen.queryByText(/offline/i)).toBeNull();

    fireEvent.click(button);

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledTimes(1));
    const [, mime, body] = downloadTextFile.mock.calls[0];
    expect(mime).toMatch(/json/);
    expect(JSON.parse(body as string).entries).toHaveLength(1);
  });

  it('disables the backup button while offline, with a hint (C-36)', () => {
    onLineSpy = setOnline(false);
    render(<ExportPanel userId={USER} />);

    const button = screen.getByRole('button', { name: /download backup/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/you’re offline/i)).toBeTruthy();
    expect(downloadTextFile).not.toHaveBeenCalled();
  });

  it('disables the advanced CSV export while offline too', () => {
    window.history.replaceState({}, '', '/?advanced=1');
    onLineSpy = setOnline(false);
    render(<ExportPanel userId={USER} />);

    const csv = screen.getByRole('button', { name: /export spreadsheet/i }) as HTMLButtonElement;
    expect(csv.disabled).toBe(true);
    expect(screen.getAllByText(/you’re offline/i)).toHaveLength(2);
  });

  it('re-enables the buttons when the connection comes back', async () => {
    onLineSpy = setOnline(false);
    render(<ExportPanel userId={USER} />);

    const button = screen.getByRole('button', { name: /download backup/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    onLineSpy.mockReturnValue(true);
    fireEvent(window, new Event('online'));

    await waitFor(() => expect(button.disabled).toBe(false));
    expect(screen.queryByText(/you’re offline/i)).toBeNull();
  });
});
