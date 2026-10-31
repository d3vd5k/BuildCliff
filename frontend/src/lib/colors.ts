// Step colors matching Section 3.1 of prompt and contract.md
export const STEP_COLORS: Record<string, string> = {
  checkout: '#6B7A90', // slate
  install:  '#22D3EE', // cyan
  build:    '#818CF8', // indigo
  test:     '#3DDC97', // green
  deploy:   '#F5B544', // amber
  all:      '#A78BFA', // violet for total CI
};

export const STEP_LABELS: Record<string, string> = {
  checkout: 'Checkout',
  install:  'Install',
  build:    'Build',
  test:     'Test',
  deploy:   'Deploy',
  all:      'All Steps',
};

export const STEP_ORDER = ['checkout', 'install', 'build', 'test', 'deploy'] as const;

export const CONFIDENCE_COLORS: Record<'High' | 'Medium' | 'Low', { text: string; bg: string; border: string }> = {
  High: {
    text: '#3DDC97',
    bg: 'rgba(61, 220, 151, 0.12)',
    border: 'rgba(61, 220, 151, 0.35)',
  },
  Medium: {
    text: '#F5B544',
    bg: 'rgba(245, 181, 68, 0.12)',
    border: 'rgba(245, 181, 68, 0.35)',
  },
  Low: {
    text: '#FF5C5C',
    bg: 'rgba(255, 92, 92, 0.14)',
    border: 'rgba(255, 92, 92, 0.35)',
  },
};

