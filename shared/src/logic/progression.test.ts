import { describe, it, expect } from 'vitest'
import { applyExp } from './progression'
import { STAT_POINTS_PER_LEVEL } from '../data'

describe('applyExp', () => {
  it('accumulates exp without levelling when below the threshold', () => {
    // expForLv(1) = 25; gaining 10 stays at level 1
    expect(applyExp(1, 0, 10)).toEqual({
      lv: 1, exp: 10, levelsGained: 0, pointsGained: 0,
    })
  })

  it('levels up once and grants STAT_POINTS_PER_LEVEL points', () => {
    // expForLv(1) = 25; gaining 30 → level 2 with 5 exp left over
    expect(applyExp(1, 0, 30)).toEqual({
      lv: 2, exp: 5, levelsGained: 1, pointsGained: STAT_POINTS_PER_LEVEL,
    })
  })

  it('spans multiple levels: pointsGained = levelsGained × STAT_POINTS_PER_LEVEL', () => {
    // expForLv(1)=25, expForLv(2)=42 → 70 exp clears two levels, 3 left
    expect(applyExp(1, 0, 70)).toEqual({
      lv: 3, exp: 3, levelsGained: 2, pointsGained: STAT_POINTS_PER_LEVEL * 2,
    })
  })
})
