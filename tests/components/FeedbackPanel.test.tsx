import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FeedbackPanel } from '../../src/components/settings/FeedbackPanel';
import { offlineDB } from '../../src/lib/offline/store';
import { useQueueStatusStore } from '../../src/store/queueStatus';

// Keep the import chain (useSync → queue → sync) off the real client.
vi.mock('../../src/lib/supabase', () => ({ supabase: { auth: {} } }));

const USER = 'user-1';

function mailtoOf(link: HTMLElement) {
  return decodeURIComponent(link.getAttribute('href') ?? '');
}

beforeEach(async () => {
  await offlineDB.writes.clear();
  await offlineDB.dead.clear();
  useQueueStatusStore.setState({ status: 'idle', deadCount: 0, lastSyncedAt: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FeedbackPanel', () => {
  it('sends feedback to the app domain, not a personal mailbox', () => {
    render(<FeedbackPanel userId={USER} />);
    const href = mailtoOf(screen.getByRole('link'));
    expect(href.startsWith('mailto:feedback@hour25.app?')).toBe(true);
    expect(href).toContain('subject=Hour 25 feedback');
  });

  it('attaches the state a bug report needs to be actionable', async () => {
    useQueueStatusStore.setState({ deadCount: 2 });
    await offlineDB.writes.put({
      userId: USER,
      date: '2026-09-10',
      slotIndex: 20,
      op: 'upsert',
      labelId: 'label-1',
      note: null,
      chunkMinutes: 30,
      enqueuedAt: Date.now(),
      rev: 'rev-20',
      attempts: 0,
    });

    render(<FeedbackPanel userId={USER} />);

    await waitFor(() => {
      expect(mailtoOf(screen.getByRole('link'))).toContain('waiting to sync: 1');
    });
    const href = mailtoOf(screen.getByRole('link'));
    expect(href).toContain('set aside: 2');
    expect(href).toContain(`account: ${USER}`);
  });

  it('reports the offline case as offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<FeedbackPanel userId={USER} />);
    expect(mailtoOf(screen.getByRole('link'))).toContain('connection: offline');
  });
});
