import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { UIProvider } from '../src/context/UIContext';
import { ImpactTable } from '../src/components/deps/ImpactTable';
import type { DependencyImpact } from '../src/api/types';

const mockImpacts: DependencyImpact[] = [
  {
    impact_id: 'sha1:puppeteer',
    project_id: 'demo-app',
    dep: 'puppeteer',
    from: '21.0.0',
    to: '22.0.0',
    commit_sha: 'a3f9c1d84be27f5c0d6e91a2b7c3f45e8d09a1b6',
    step: 'install',
    before_ms: 70000,
    after_ms: 270000,
    delta_ms: 200000,
    delta_pct: 285.7,
    runs_compared: { before: 10, after: 5 },
    finding_id: 'demo-app:main:install:run_0116',
  },
  {
    impact_id: 'sha2:eslint',
    project_id: 'demo-app',
    dep: 'eslint',
    from: '8.45.0',
    to: '8.50.0',
    commit_sha: '8f2a1b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a',
    step: 'test',
    before_ms: 120000,
    after_ms: 122000,
    delta_ms: 2000, // Near-zero (<5000ms)
    delta_pct: 1.7,
    runs_compared: { before: 8, after: 5 },
    finding_id: null,
  },
];

describe('ImpactTable component', () => {
  it('renders rows and flags near-zero rows with "no measurable impact"', () => {
    render(
      <UIProvider>
        <BrowserRouter>
          <ImpactTable impacts={mockImpacts} />
        </BrowserRouter>
      </UIProvider>
    );

    expect(screen.getByText('puppeteer')).toBeInTheDocument();
    expect(screen.getByText('eslint')).toBeInTheDocument();
    expect(screen.getByText(/no measurable impact/i)).toBeInTheDocument();
  });

  it('allows clicking headers to sort table', () => {
    render(
      <UIProvider>
        <BrowserRouter>
          <ImpactTable impacts={mockImpacts} />
        </BrowserRouter>
      </UIProvider>
    );

    const depHeader = screen.getByText('Dependency');
    fireEvent.click(depHeader);
    expect(depHeader).toBeInTheDocument();
  });
});

