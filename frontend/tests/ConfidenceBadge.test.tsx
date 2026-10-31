import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ConfidenceBadge } from '../src/components/culprit/ConfidenceBadge';
import type { Confidence } from '../src/api/types';

describe('ConfidenceBadge component', () => {
  it('renders High confidence badge and positive reason chips', () => {
    const highConf: Confidence = {
      level: 'High',
      score: 91,
      jump_score: 95,
      attribution_score: 88,
      reasons: [
        { code: 'JUMP_PERSISTS', label: 'Slow in 5 of 5 runs after the change', polarity: 'positive' },
        { code: 'SOLE_COMMIT', label: 'Only one commit in range', polarity: 'positive' },
      ],
    };

    render(<ConfidenceBadge confidence={highConf} />);

    expect(screen.getByText(/HIGH · 91%/i)).toBeInTheDocument();
    expect(screen.getByText('Slow in 5 of 5 runs after the change')).toBeInTheDocument();
    expect(screen.getByText('Only one commit in range')).toBeInTheDocument();
  });

  it('renders Low confidence badge with warning reason chips', () => {
    const lowConf: Confidence = {
      level: 'Low',
      score: 34,
      reasons: [
        { code: 'MULTIPLE_CANDIDATES', label: '3 commits between the last good and first slow run', polarity: 'negative' },
      ],
    };

    render(<ConfidenceBadge confidence={lowConf} />);

    expect(screen.getByText(/LOW · 34%/i)).toBeInTheDocument();
    expect(screen.getByText('3 commits between the last good and first slow run')).toBeInTheDocument();
  });
});

