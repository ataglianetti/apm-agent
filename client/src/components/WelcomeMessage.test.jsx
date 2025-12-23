import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WelcomeMessage } from './WelcomeMessage';
import { ThemeProvider } from '../context/ThemeContext';

// Wrapper component to provide theme context
const renderWithTheme = (component, isDark = true) => {
  return render(<ThemeProvider>{component}</ThemeProvider>);
};

describe('WelcomeMessage', () => {
  it('renders the title', () => {
    renderWithTheme(<WelcomeMessage />);
    expect(screen.getByText('APM Music Search Assistant')).toBeInTheDocument();
  });

  it('renders the description', () => {
    renderWithTheme(<WelcomeMessage />);
    expect(screen.getByText(/Search our catalog of 10,000\+ tracks/i)).toBeInTheDocument();
  });

  it('renders example prompts', () => {
    renderWithTheme(<WelcomeMessage />);
    expect(screen.getByText('"rock"')).toBeInTheDocument();
    expect(screen.getByText('"classical"')).toBeInTheDocument();
    expect(screen.getByText('"dark tension suspense"')).toBeInTheDocument();
    expect(screen.getByText('"What projects am I working on?"')).toBeInTheDocument();
  });

  it('renders the music icon', () => {
    renderWithTheme(<WelcomeMessage />);
    // The SVG should be present
    const icon = document.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });
});
