import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RestorePanel } from '../../src/components/settings/RestorePanel';

vi.mock('../../src/lib/supabase', () => ({ supabase: { auth: {} } }));

const listAllLabels = vi.fn();
const insertLabelForRestore = vi.fn();
vi.mock('../../src/lib/db/labels', () => ({
  listAllLabels: (...args: unknown[]) => listAllLabels(...args),
  insertLabelForRestore: (...args: unknown[]) => insertLabelForRestore(...args),
}));

const listCategories = vi.fn();
const createCategory = vi.fn();
vi.mock('../../src/lib/db/categories', () => ({
  listCategories: (...args: unknown[]) => listCategories(...args),
  createCategory: (...args: unknown[]) => createCategory(...args),
}));

const getEarliestEntryDate = vi.fn();
const bulkUpsertDirect = vi.fn();
vi.mock('../../src/lib/db/entries', () => ({
  getEarliestEntryDate: (...args: unknown[]) => getEarliestEntryDate(...args),
  bulkUpsertDirect: (...args: unknown[]) => bulkUpsertDirect(...args),
}));

const updateSettings = vi.fn();
vi.mock('../../src/lib/db/settings', () => ({
  updateSettings: (...args: unknown[]) => updateSettings(...args),
}));

const USER = 'user-1';

const BACKUP = JSON.stringify({
  version: 1,
  exportedAt: '2026-07-19T12:00:00.000Z',
  settings: {
    timezone: 'UTC',
    sleep_start: 46,
    sleep_end: 14,
    sleep_label_id: 'old-l1',
    chunk_minutes: 30,
    target_minutes_day: null,
    dashboard_config: null,
    theme: 'system',
    onboarded_at: '2026-03-01T00:00:00.000Z',
    created_at: '2026-03-01T00:00:00.000Z',
  },
  categories: [],
  labels: [{ id: 'old-l1', name: 'sleep', color: '#004972', categoryId: null, deletedAt: null }],
  entries: [
    { date: '2026-07-01', slotIndex: 0, labelId: 'old-l1', note: 'a note', chunkMinutes: 30 },
    { date: '2026-07-01', slotIndex: 1, labelId: 'old-l1', note: null, chunkMinutes: 30 },
  ],
});

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RestorePanel userId={USER} />
    </QueryClientProvider>,
  );
}

async function chooseFile(json: string) {
  const input = screen.getByLabelText(/choose a backup file/i) as HTMLInputElement;
  const file = new File([json], 'backup.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(json) });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  listAllLabels.mockResolvedValue([]);
  listCategories.mockResolvedValue([]);
  getEarliestEntryDate.mockResolvedValue(null);
  createCategory.mockResolvedValue({ kind: 'created', category: { id: 'new-cat' } });
  insertLabelForRestore.mockResolvedValue({ id: 'new-l1' });
  bulkUpsertDirect.mockImplementation(async (_u, rows, onProgress) => {
    onProgress?.(rows.length, rows.length);
  });
  updateSettings.mockResolvedValue({});
});

describe('RestorePanel', () => {
  it('summarises a valid backup file before anything is written', async () => {
    renderPanel();
    await chooseFile(BACKUP);

    expect(await screen.findByText(/1 label\b/i)).toBeTruthy();
    expect(screen.getByText(/2 entries/i)).toBeTruthy();
    expect(bulkUpsertDirect).not.toHaveBeenCalled();
  });

  it('restores: labels inserted, entries written with remapped ids, settings updated', async () => {
    renderPanel();
    await chooseFile(BACKUP);

    fireEvent.click(await screen.findByRole('button', { name: /restore/i }));
    await screen.findByText(/restored 2 entries/i);

    expect(insertLabelForRestore).toHaveBeenCalledWith(USER, {
      name: 'sleep',
      color: '#004972',
      categoryId: null,
      deletedAt: null,
    });
    const rows = bulkUpsertDirect.mock.calls[0][1];
    expect(rows).toEqual([
      { date: '2026-07-01', slotIndex: 0, labelId: 'new-l1', note: 'a note', chunkMinutes: 30 },
      { date: '2026-07-01', slotIndex: 1, labelId: 'new-l1', note: null, chunkMinutes: 30 },
    ]);
    expect(updateSettings).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ sleep_label_id: 'new-l1' }),
    );
  });

  it('refuses a wrong-version file with an inline error', async () => {
    renderPanel();
    await chooseFile(JSON.stringify({ version: 3 }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/version 3/);
  });

  it('refuses to restore into a non-empty account', async () => {
    listAllLabels.mockResolvedValue([{ id: 'existing' }]);
    renderPanel();
    await chooseFile(BACKUP);

    fireEvent.click(await screen.findByRole('button', { name: /restore/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/empty account/i);
    expect(bulkUpsertDirect).not.toHaveBeenCalled();
  });

  it('disables the restore button while offline, with a hint (C-36)', async () => {
    const onLineSpy = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      renderPanel();
      await chooseFile(BACKUP);

      const button = (await screen.findByRole('button', { name: /restore/i })) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(screen.getByText(/offline/i)).toBeTruthy();
    } finally {
      onLineSpy.mockRestore();
    }
  });
});
