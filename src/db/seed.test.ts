import { describe, expect, it } from 'vitest'
import { builtinExercises, starterRoutines } from './seed'

const now = '2026-07-19T12:00:00.000Z'

describe('builtin exercise library', () => {
  it('has unique ids and names, and covers every muscle group', () => {
    const all = builtinExercises(now)
    expect(all.length).toBeGreaterThanOrEqual(115)
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length)
    expect(new Set(all.map((e) => e.name.toLowerCase())).size).toBe(all.length)
    const muscles = new Set(all.map((e) => e.primaryMuscle))
    for (const m of [
      'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
      'quads', 'hamstrings', 'glutes', 'calves', 'core',
    ]) {
      expect(muscles.has(m as never), m).toBe(true)
    }
  })

  it('contains the combined personal and foundational priority movements', () => {
    const names = new Set(builtinExercises(now).map((exercise) => exercise.name))
    const priorityNames = [
      'Machine Lat Pulldown',
      'Seated Machine Row',
      'Machine Reverse Fly',
      'Machine Chest Press',
      'Machine Chest Fly',
      'Chest Fly',
      'Machine Shoulder Press',
      'Cable Lateral Raise',
      'Triceps Extension',
      'Cable Lat Pulldown',
      'Cable Triceps Extension',
      'Hammer Curl',
      'Machine Back Extension',
      'Machine Bicep Curl',
      'Leg Extension',
      'Lying Leg Curl',
      'Machine Crunch',
      'Seated Wide-Grip Cable Row',
      'Seated Leg Press',
      'Incline Barbell Bench Press',
      'Smith Machine Shrug',
      'Back Squat',
      'Deadlift',
      'Barbell Bench Press',
      'Overhead Press',
      'Pull-Up',
      'Barbell Row',
      'Romanian Deadlift',
      'Walking Lunge',
      'Push-Up',
      "Farmer's Carry",
    ]

    for (const name of priorityNames) expect(names.has(name), name).toBe(true)
  })
})

describe('starter routines', () => {
  it('provides four complete, editable workout templates', () => {
    const { routines, routineExercises } = starterRoutines(now)

    expect(routines.map((routine) => routine.name)).toEqual([
      'Upper Foundation',
      'Legs & Core',
      'Chest & Triceps',
      'Back & Biceps',
    ])
    for (const routine of routines) {
      expect(
        routineExercises.filter((entry) => entry.routineId === routine.id).length,
      ).toBeGreaterThanOrEqual(5)
    }
  })

  it('only references built-in exercises and valid set targets', () => {
    const exerciseIds = new Set(builtinExercises(now).map((exercise) => exercise.id))
    const { routineExercises } = starterRoutines(now)

    for (const entry of routineExercises) {
      expect(exerciseIds.has(entry.exerciseId)).toBe(true)
      expect(entry.targetSets).toBeGreaterThanOrEqual(2)
      expect(entry.targetSets).toBeLessThanOrEqual(3)
      expect(entry.repMin).toBeLessThan(entry.repMax)
      expect([60, 90, 120]).toContain(entry.restSeconds)
    }
  })
})
