import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WarRoom } from '../components/WarRoom/WarRoom';

describe('WarRoom', () => {
  it('renders without crash', () => {
    render(<WarRoom />);
    expect(screen.getByTestId('war-room')).toBeDefined();
  });

  it('renders agent cards when agents provided', () => {
    const agents = [
      { id: '1', name: 'Alex', role: 'Backend Engineer', status: 'idle' as const },
      { id: '2', name: 'Siri', role: 'Frontend Engineer', status: 'thinking' as const },
    ];
    render(<WarRoom agents={agents} />);
    expect(screen.getByText('Alex')).toBeDefined();
    expect(screen.getByText('Siri')).toBeDefined();
  });
});
