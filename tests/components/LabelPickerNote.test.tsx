import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LabelPicker } from '../../src/components/day/LabelPicker';
import type { LabelRow } from '../../src/lib/db/labels';

// The picker's Week 5 note behavior (DESIGN §4): the textarea exists only for
// slots with an entry; a changed note rides along with a label selection;
// Save note commits a note-only update. The full keyboard model has its own
// backlog entry — this file covers what notes added.

const label: LabelRow = {
  id: 'label-1',
  user_id: 'user-1',
  category_id: null,
  name: 'Deep work',
  color: '#334455',
  deleted_at: null,
  created_at: '',
};

function renderPicker(overrides: Partial<React.ComponentProps<typeof LabelPicker>> = {}) {
  const onSelect = vi.fn();
  const onSaveNote = vi.fn();
  render(
    <LabelPicker
      userId="user-1"
      slotIndex={18}
      hasEntry={false}
      initialNote={null}
      autofocusNote={false}
      mode="popover"
      anchor={{ top: 0, left: 0, bottom: 0, width: 0 }}
      labels={[label]}
      categories={[]}
      onSelect={onSelect}
      onSaveNote={onSaveNote}
      onClear={() => {}}
      onClose={() => {}}
      {...overrides}
    />,
  );
  return { onSelect, onSaveNote };
}

describe('LabelPicker notes', () => {
  it('hides the note field for an empty slot', () => {
    renderPicker({ hasEntry: false });
    expect(screen.queryByLabelText('Note for this slot')).toBeNull();
  });

  it('shows the slot’s existing note for a filled slot', () => {
    renderPicker({ hasEntry: true, initialNote: 'standup ran long' });
    const field = screen.getByLabelText<HTMLTextAreaElement>('Note for this slot');
    expect(field.value).toBe('standup ran long');
    // Unchanged note → no Save button (selection would carry it anyway).
    expect(screen.queryByRole('button', { name: 'Save note' })).toBeNull();
  });

  it('selecting a label passes a changed note along, whitespace-only as null', () => {
    const { onSelect } = renderPicker({ hasEntry: true, initialNote: null });
    fireEvent.change(screen.getByLabelText('Note for this slot'), {
      target: { value: 'call with Sam' },
    });
    fireEvent.click(screen.getByRole('option', { name: /Deep work/ }));
    expect(onSelect).toHaveBeenCalledWith('label-1', 'call with Sam');
  });

  it('selecting a label with the note untouched passes undefined (keep existing)', () => {
    const { onSelect } = renderPicker({ hasEntry: true, initialNote: 'keep me' });
    fireEvent.click(screen.getByRole('option', { name: /Deep work/ }));
    expect(onSelect).toHaveBeenCalledWith('label-1', undefined);
  });

  it('Save note commits a note-only update', () => {
    const { onSaveNote, onSelect } = renderPicker({ hasEntry: true, initialNote: 'old' });
    fireEvent.change(screen.getByLabelText('Note for this slot'), { target: { value: 'new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(onSaveNote).toHaveBeenCalledWith('new');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clearing the text saves the note away as null', () => {
    const { onSaveNote } = renderPicker({ hasEntry: true, initialNote: 'old' });
    fireEvent.change(screen.getByLabelText('Note for this slot'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(onSaveNote).toHaveBeenCalledWith(null);
  });

  it('keys typed in the note field are text, not picker commands', () => {
    const { onSelect } = renderPicker({ hasEntry: true, initialNote: null });
    const field = screen.getByLabelText('Note for this slot');
    // '1' must not select Recent #1, Enter must not select the top match.
    fireEvent.keyDown(field, { key: '1' });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
