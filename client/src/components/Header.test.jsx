import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from './Header';
import { ThemeProvider } from '../context/ThemeContext';

// Mock fetch for DemoControls
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

const renderWithTheme = component => {
  return render(<ThemeProvider>{component}</ThemeProvider>);
};

describe('Header', () => {
  it('renders the APM Music logo', () => {
    renderWithTheme(<Header onClear={vi.fn()} onSettingsChange={vi.fn()} />);
    expect(screen.getByAltText('APM Music')).toBeInTheDocument();
  });

  it('renders Search Assistant text', () => {
    renderWithTheme(<Header onClear={vi.fn()} onSettingsChange={vi.fn()} />);
    expect(screen.getByText('Search Assistant')).toBeInTheDocument();
  });

  it('renders Clear Chat button', () => {
    renderWithTheme(<Header onClear={vi.fn()} onSettingsChange={vi.fn()} />);
    expect(screen.getByText('Clear Chat')).toBeInTheDocument();
  });

  it('calls onClear when Clear Chat is clicked', () => {
    const onClear = vi.fn();
    renderWithTheme(<Header onClear={onClear} onSettingsChange={vi.fn()} />);

    fireEvent.click(screen.getByText('Clear Chat'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('renders theme toggle button', () => {
    renderWithTheme(<Header onClear={vi.fn()} onSettingsChange={vi.fn()} />);
    // In dark mode, the title should be "Switch to light mode"
    expect(screen.getByTitle(/Switch to (light|dark) mode/)).toBeInTheDocument();
  });

  it('toggles theme when theme button is clicked', () => {
    renderWithTheme(<Header onClear={vi.fn()} onSettingsChange={vi.fn()} />);

    const themeButton = screen.getByTitle(/Switch to (light|dark) mode/);
    const initialTitle = themeButton.getAttribute('title');

    fireEvent.click(themeButton);

    // Title should change after toggle
    const newTitle = themeButton.getAttribute('title');
    expect(newTitle).not.toBe(initialTitle);
  });
});
