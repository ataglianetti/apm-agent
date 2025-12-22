import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

// Mock fetch globally
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      })
    )
  );
});

describe('App', () => {
  it('renders the header with APM Music logo', () => {
    render(<App />);
    expect(screen.getByAltText('APM Music')).toBeInTheDocument();
  });

  it('renders the welcome message', () => {
    render(<App />);
    expect(screen.getByText('APM Music Search Assistant')).toBeInTheDocument();
  });

  it('renders the message input', () => {
    render(<App />);
    expect(screen.getByPlaceholderText(/search for music/i)).toBeInTheDocument();
  });
});
