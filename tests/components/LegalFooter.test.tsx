import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LegalFooter } from '../../src/components/settings/LegalFooter';

describe('LegalFooter', () => {
  it('links both pages the privacy policy and terms are promised at', () => {
    render(<LegalFooter />);
    expect(screen.getByRole('link', { name: 'Privacy policy' }).getAttribute('href')).toBe(
      '/privacy',
    );
    expect(screen.getByRole('link', { name: 'Terms of use' }).getAttribute('href')).toBe('/terms');
  });

  it('uses the canonical paths rather than the redirecting .html ones', () => {
    render(<LegalFooter />);
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toMatch(/\.html$/);
    }
  });

  it('groups the links in a named landmark', () => {
    render(<LegalFooter />);
    expect(screen.getByRole('navigation', { name: 'Legal' })).toBeTruthy();
  });
});
