import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import WarRoom from '../components/WarRoom'

describe('WarRoom', () => {
  it('renders without crash', () => {
    render(<WarRoom />)
    expect(screen.getByTestId('war-room')).toBeInTheDocument()
  })

  it('shows agents header', () => {
    render(<WarRoom />)
    expect(screen.getByText(/war room/i)).toBeInTheDocument()
  })
})
