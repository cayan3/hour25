import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DeadLetterToast } from '../../src/components/sync/DeadLetterToast';
import { useQueueStatusStore } from '../../src/store/queueStatus';

beforeEach(() => {
  useQueueStatusStore.setState({ status: 'idle', deadCount: 0 });
});

describe('DeadLetterToast', () => {
  it('renders nothing until deadCount rises', () => {
    render(<DeadLetterToast onOpenSettings={() => {}} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not fire for dead letters that predate mounting', () => {
    useQueueStatusStore.setState({ deadCount: 3 });
    render(<DeadLetterToast onOpenSettings={() => {}} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('announces the number of newly set-aside entries', async () => {
    render(<DeadLetterToast onOpenSettings={() => {}} />);
    act(() => useQueueStatusStore.setState({ deadCount: 1 }));
    expect((await screen.findByRole('status')).textContent).toContain(
      '1 entry couldn’t sync and was set aside',
    );

    act(() => useQueueStatusStore.setState({ deadCount: 3 }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        '2 entries couldn’t sync and were set aside',
      ),
    );
  });

  it('routes Details to Settings and closes', async () => {
    const onOpenSettings = vi.fn();
    render(<DeadLetterToast onOpenSettings={onOpenSettings} />);
    act(() => useQueueStatusStore.setState({ deadCount: 1 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a discard (deadCount decrease) never toasts', () => {
    useQueueStatusStore.setState({ deadCount: 2 });
    render(<DeadLetterToast onOpenSettings={() => {}} />);
    act(() => useQueueStatusStore.setState({ deadCount: 1 }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
