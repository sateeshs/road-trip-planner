import { describe, it, expect } from 'vitest'
import { metersToMiles, secondsToTime } from '../src/osrm-client'

describe('metersToMiles', () => {
  it('converts meters to miles string', () => {
    expect(metersToMiles(1609.34)).toBe('1 miles')
    expect(metersToMiles(16093.4)).toBe('10 miles')
  })
})

describe('secondsToTime', () => {
  it('formats sub-hour durations', () => {
    expect(secondsToTime(1800)).toBe('30m')
  })

  it('formats hours and minutes', () => {
    expect(secondsToTime(9300)).toBe('2h 35m')
  })
})
