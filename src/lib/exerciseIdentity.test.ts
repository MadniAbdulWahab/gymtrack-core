import { describe, expect, it } from 'vitest'
import { builtinExercises } from '../db/seed'
import { matchExercise, matchLegacyExercise } from './exerciseIdentity'

const builtins = builtinExercises('2026-07-24T00:00:00.000Z')

describe('exercise identity', () => {
  it('matches equipment-specific imports to one canonical built-in', () => {
    expect(matchExercise('Chest Press (Machine)', builtins)).toBe(
      'builtin-machine-chest-press',
    )
    expect(matchExercise('Chest Press (Band)', builtins)).toBe(
      'builtin-band-chest-press',
    )
    expect(matchExercise('Front Raise (Cable)', builtins)).toBe(
      'builtin-cable-front-raise',
    )
    expect(matchExercise('Incline Chest Press (Machine)', builtins)).toBe(
      'builtin-incline-machine-chest-press',
    )
  })

  it('recovers equipment removed by older Strong imports from their stable id', () => {
    expect(
      matchLegacyExercise(
        { id: 'strong-chest-press-machine', name: 'Chest Press' },
        builtins,
      ),
    ).toBe('builtin-machine-chest-press')
    expect(
      matchLegacyExercise(
        { id: 'strong-chest-press-band', name: 'Chest Press' },
        builtins,
      ),
    ).toBe('builtin-band-chest-press')
  })

  it('does not invent a canonical id for an unknown movement', () => {
    expect(
      matchLegacyExercise(
        { id: 'strong-my-custom-movement', name: 'My Custom Movement' },
        builtins,
      ),
    ).toBeNull()
  })
})
