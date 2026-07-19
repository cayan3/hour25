import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ImportPanel } from '../../src/components/settings/ImportPanel';

vi.mock('../../src/lib/supabase', () => ({ supabase: { auth: {} } }));

const listActiveLabels = vi.fn();
const createLabel = vi.fn();
const restoreLabel = vi.fn();
vi.mock('../../src/lib/db/labels', () => ({
  listActiveLabels: (...args: unknown[]) => listActiveLabels(...args),
  createLabel: (...args: unknown[]) => createLabel(...args),
  restoreLabel: (...args: unknown[]) => restoreLabel(...args),
}));

const getEntriesForRange = vi.fn();
const bulkUpsertDirect = vi.fn();
vi.mock('../../src/lib/db/entries', () => ({
  getEntriesForRange: (...args: unknown[]) => getEntriesForRange(...args),
  bulkUpsertDirect: (...args: unknown[]) => bulkUpsertDirect(...args),
}));

const USER = 'user-1';

const APP_HEADER = `date,${Array.from({ length: 48 }, (_, i) => i).join(',')}`;
const CSV = `${APP_HEADER}\r\n2026-07-01,Work,gym${','.repeat(46)}`;

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ImportPanel userId={USER} />
    </QueryClientProvider>,
  );
}

async function chooseFile(csv: string) {
  const input = screen.getByLabelText(/choose a csv file/i) as HTMLInputElement;
  const file = new File([csv], 'export.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(csv) });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText(/1 day/i);
}

beforeEach(() => {
  vi.clearAllMocks();
  listActiveLabels.mockResolvedValue([
    { id: 'l-work', name: 'Work', color: '#111111', deleted_at: null },
  ]);
  getEntriesForRange.mockResolvedValue([]);
  bulkUpsertDirect.mockImplementation(async (_u, rows, onProgress) => {
    onProgress?.(rows.length, rows.length);
  });
  createLabel.mockResolvedValue({ kind: 'created', label: { id: 'l-gym' } });
});

describe('ImportPanel', () => {
  it('previews a chosen file: counts, span, and unknown labels defaulting to create', async () => {
    renderPanel();
    await chooseFile(CSV);

    expect(screen.getByText(/2 filled slots/i)).toBeTruthy();
    expect(screen.getByText('gym')).toBeTruthy();
    const action = screen.getByLabelText(/what to do with "gym"/i) as HTMLSelectElement;
    expect(action.value).toBe('create');
  });

  it('shows the parser error inline when the file is not recognisable', async () => {
    renderPanel();
    const input = screen.getByLabelText(/choose a csv file/i) as HTMLInputElement;
    const file = new File(['nope'], 'bad.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve('nope') });
    fireEvent.change(input, { target: { files: [file] } });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/unrecognised/i);
  });

  it('commits: creates the unknown label, writes the rows, and reports the outcome', async () => {
    renderPanel();
    await chooseFile(CSV);

    fireEvent.click(screen.getByRole('button', { name: /import 2 slots/i }));

    await screen.findByText(/imported 2 slots/i);
    expect(createLabel).toHaveBeenCalledWith(USER, 'gym', expect.any(String));
    expect(bulkUpsertDirect).toHaveBeenCalledTimes(1);
    const rows = bulkUpsertDirect.mock.calls[0][1];
    expect(rows).toEqual([
      { date: '2026-07-01', slotIndex: 0, labelId: 'l-work' },
      { date: '2026-07-01', slotIndex: 1, labelId: 'l-gym' },
    ]);
  });

  it('maps an unknown name onto an existing label instead of creating when told to', async () => {
    renderPanel();
    await chooseFile(CSV);

    const action = screen.getByLabelText(/what to do with "gym"/i);
    fireEvent.change(action, { target: { value: 'map' } });
    const target = screen.getByLabelText(/label to use for "gym"/i);
    fireEvent.change(target, { target: { value: 'l-work' } });

    fireEvent.click(screen.getByRole('button', { name: /import 2 slots/i }));
    await screen.findByText(/imported 2 slots/i);

    expect(createLabel).not.toHaveBeenCalled();
    const rows = bulkUpsertDirect.mock.calls[0][1];
    expect(rows).toEqual([
      { date: '2026-07-01', slotIndex: 0, labelId: 'l-work' },
      { date: '2026-07-01', slotIndex: 1, labelId: 'l-work' },
    ]);
  });

  it('skipping an unknown name imports the other slots only', async () => {
    renderPanel();
    await chooseFile(CSV);

    fireEvent.change(screen.getByLabelText(/what to do with "gym"/i), { target: { value: 'skip' } });
    fireEvent.click(screen.getByRole('button', { name: /import 2 slots/i }));
    await screen.findByText(/imported 1 slot\b/i);

    const rows = bulkUpsertDirect.mock.calls[0][1];
    expect(rows).toEqual([{ date: '2026-07-01', slotIndex: 0, labelId: 'l-work' }]);
  });

  it('disables the import button while offline, with a hint (C-36)', async () => {
    const onLineSpy = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      renderPanel();
      await chooseFile(CSV);

      const button = screen.getByRole('button', { name: /import 2 slots/i }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(screen.getByText(/offline/i)).toBeTruthy();
    } finally {
      onLineSpy.mockRestore();
    }
  });

  it('surfaces a connection loss as a re-run hint and stays on the preview', async () => {
    bulkUpsertDirect.mockRejectedValue(Object.assign(new Error('fetch failed'), { kind: 'network' }));
    renderPanel();
    await chooseFile(CSV);

    fireEvent.click(screen.getByRole('button', { name: /import 2 slots/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/re-run/i);
    // Still on the preview so the user can simply press import again.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /import 2 slots/i })).toBeTruthy();
    });
  });
});
