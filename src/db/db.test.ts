import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { builtinExercises, starterRoutines } from './seed'

afterEach(async () => {
  await Dexie.delete('ironlog')
})

describe('database upgrades', () => {
  it('adds starter routines after upgrading an existing v2 install', async () => {
    const legacy = new Dexie('ironlog')
    legacy.version(1).stores({
      exercises: 'id, name, primaryMuscle, isCustom',
      routines: 'id, position',
      routineExercises: 'id, routineId, exerciseId',
      workouts: 'id, startedAt, completedAt',
      workoutExercises: 'id, workoutId, exerciseId',
      sets: 'id, workoutId, workoutExerciseId',
      settings: 'id',
    })
    legacy.version(2).stores({ bodyWeight: 'id, measuredAt' })
    await legacy.open()

    const now = '2026-07-19T12:00:00.000Z'
    await legacy.table('exercises').bulkAdd(builtinExercises(now))
    await legacy.table('routines').add({
      id: 'existing-routine',
      name: 'My routine',
      position: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    legacy.close()

    const { db } = await import('./db')
    await db.open()
    const routines = await db.routines.orderBy('position').toArray()
    const starters = routines.filter((routine) => routine.id.startsWith('starter-'))

    expect(routines[0].id).toBe('existing-routine')
    expect(routines[0].deletedAt).not.toBeNull()
    expect(starters).toHaveLength(4)
    expect(await db.routineExercises.count()).toBeGreaterThanOrEqual(20)
    db.close()
  })

  it('restores a modified example and preserves its useful edits as a copy', async () => {
    const legacy = new Dexie('ironlog')
    legacy.version(1).stores({
      exercises: 'id, name, primaryMuscle, isCustom',
      routines: 'id, position',
      routineExercises: 'id, routineId, exerciseId',
      workouts: 'id, startedAt, completedAt',
      workoutExercises: 'id, workoutId, exerciseId',
      sets: 'id, workoutId, workoutExerciseId',
      settings: 'id',
    })
    legacy.version(2).stores({ bodyWeight: 'id, measuredAt' })
    legacy.version(3).stores({})
    await legacy.open()

    const now = '2026-07-19T12:00:00.000Z'
    const seeded = starterRoutines(now)
    await legacy.table('exercises').bulkAdd(builtinExercises(now))
    await legacy.table('routines').bulkAdd(seeded.routines)
    await legacy.table('routineExercises').bulkAdd(seeded.routineExercises)

    const upper = seeded.routines[0]
    const [bench] = seeded.routineExercises.filter(
      (entry) => entry.routineId === upper.id,
    )
    await legacy.table('routines').update(upper.id, { name: 'My edited upper' })
    await legacy.table('routineExercises').where('routineId').equals(upper.id).delete()
    await legacy.table('routineExercises').add({ ...bench, targetSets: 1 })
    legacy.close()

    const { db } = await import('./db')
    await db.open()
    expect(await db.routines.get(upper.id)).toMatchObject({
      name: 'Upper Foundation',
      deletedAt: null,
    })
    expect(
      await db.routineExercises.where('routineId').equals(upper.id).count(),
    ).toBe(5)

    const saved = await db.routines
      .filter((routine) => routine.name === 'My edited upper (saved copy)')
      .first()
    expect(saved).toBeDefined()
    expect(
      await db.routineExercises.where('routineId').equals(saved!.id).count(),
    ).toBe(1)
    db.close()
  })

  it('adds the configured rest time to existing exercise plans and workouts', async () => {
    const legacy = new Dexie('ironlog')
    legacy.version(1).stores({
      exercises: 'id, name, primaryMuscle, isCustom',
      routines: 'id, position',
      routineExercises: 'id, routineId, exerciseId',
      workouts: 'id, startedAt, completedAt',
      workoutExercises: 'id, workoutId, exerciseId',
      sets: 'id, workoutId, workoutExerciseId',
      settings: 'id',
    })
    legacy.version(2).stores({ bodyWeight: 'id, measuredAt' })
    legacy.version(3).stores({})
    legacy.version(4).stores({})
    legacy.version(5).stores({})
    await legacy.open()

    const now = '2026-07-19T12:00:00.000Z'
    await legacy.table('settings').add({
      id: 'app',
      unit: 'kg',
      restSeconds: 135,
      incrementKg: 2.5,
      incrementLb: 5,
      updatedAt: now,
    })
    await legacy.table('routines').add({
      id: 'personal-routine',
      name: 'Push day',
      position: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    await legacy.table('routineExercises').add({
      id: 'personal-plan',
      routineId: 'personal-routine',
      exerciseId: 'builtin-barbell-bench-press',
      position: 0,
      targetSets: 3,
      repMin: 8,
      repMax: 12,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    await legacy.table('workoutExercises').add({
      id: 'workout-plan',
      workoutId: 'workout',
      exerciseId: 'builtin-barbell-bench-press',
      position: 0,
      notes: '',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    legacy.close()

    const { db } = await import('./db')
    await db.open()
    expect((await db.routineExercises.get('personal-plan'))?.restSeconds).toBe(135)
    expect((await db.workoutExercises.get('workout-plan'))?.restSeconds).toBe(135)
    db.close()
  })

  it('canonicalizes an imported duplicate when adding its built-in', async () => {
    const legacy = new Dexie('ironlog')
    legacy.version(1).stores({
      exercises: 'id, name, primaryMuscle, isCustom',
      routines: 'id, position',
      routineExercises: 'id, routineId, exerciseId',
      workouts: 'id, startedAt, completedAt',
      workoutExercises: 'id, workoutId, exerciseId',
      sets: 'id, workoutId, workoutExerciseId',
      settings: 'id',
    })
    legacy.version(2).stores({ bodyWeight: 'id, measuredAt' })
    legacy.version(3).stores({})
    legacy.version(4).stores({})
    legacy.version(5).stores({})
    legacy.version(6).stores({})
    legacy.version(7).stores({ syncState: 'table' })
    await legacy.open()

    const now = '2026-07-19T12:00:00.000Z'
    await legacy.table('exercises').bulkAdd([
      builtinExercises(now)[0],
      {
        id: 'strong-bicycle-crunch',
        name: 'Bicycle Crunch',
        primaryMuscle: 'core',
        secondaryMuscles: [],
        isCustom: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    ])
    legacy.close()

    const { db } = await import('./db')
    await db.open()
    // The canonical built-in arrives and the legacy imported parent is retired.
    expect(await db.exercises.get('builtin-machine-crunch')).toBeTruthy()
    expect(await db.exercises.get('builtin-bicycle-crunch')).toBeTruthy()
    expect(
      (await db.exercises.get('strong-bicycle-crunch'))?.deletedAt,
    ).not.toBeNull()
    expect(
      (
        await db.exercises
          .filter((e) => e.name === 'Bicycle Crunch' && !e.deletedAt)
          .toArray()
      )
        .length,
    ).toBe(1)
    db.close()
  })

  it('v10 gives existing users the system appearance preference', async () => {
    const legacy = new Dexie('ironlog')
    legacy.version(1).stores({
      exercises: 'id, name, primaryMuscle, isCustom',
      routines: 'id, position',
      routineExercises: 'id, routineId, exerciseId',
      workouts: 'id, startedAt, completedAt',
      workoutExercises: 'id, workoutId, exerciseId',
      sets: 'id, workoutId, workoutExerciseId',
      settings: 'id',
    })
    legacy.version(2).stores({ bodyWeight: 'id, measuredAt' })
    legacy.version(3).stores({})
    legacy.version(4).stores({})
    legacy.version(5).stores({})
    legacy.version(6).stores({})
    legacy.version(7).stores({ syncState: 'table' })
    legacy.version(8).stores({})
    legacy.version(9).stores({ deviceState: 'key' })
    await legacy.open()

    await legacy.table('settings').add({
      id: 'app',
      unit: 'kg',
      restSeconds: 90,
      incrementKg: 2.5,
      incrementLb: 5,
      updatedAt: '2026-07-19T12:00:00.000Z',
    })
    legacy.close()

    const { db } = await import('./db')
    await db.open()
    expect((await db.settings.get('app'))?.theme).toBe('system')
    db.close()
  })

  it('v13 adds the priority Strong variants to existing installs', async () => {
    const legacy = new Dexie('ironlog')
    legacy.version(1).stores({
      exercises: 'id, name, primaryMuscle, isCustom',
      routines: 'id, position',
      routineExercises: 'id, routineId, exerciseId',
      workouts: 'id, startedAt, completedAt',
      workoutExercises: 'id, workoutId, exerciseId',
      sets: 'id, workoutId, workoutExerciseId',
      settings: 'id',
    })
    legacy.version(2).stores({ bodyWeight: 'id, measuredAt' })
    legacy.version(3).stores({})
    legacy.version(4).stores({})
    legacy.version(5).stores({})
    legacy.version(6).stores({})
    legacy.version(7).stores({ syncState: 'table' })
    legacy.version(8).stores({})
    legacy.version(9).stores({ deviceState: 'key' })
    legacy.version(10).stores({})
    legacy.version(11).stores({})
    legacy.version(12).stores({})
    await legacy.open()

    const now = '2026-07-22T12:00:00.000Z'
    await legacy.table('exercises').add({
      ...builtinExercises(now).find(
        (exercise) => exercise.name === 'Lat Pulldown',
      )!,
    })
    legacy.close()

    const { db } = await import('./db')
    await db.open()
    expect(await db.exercises.get('builtin-machine-lat-pulldown')).toBeTruthy()
    expect(await db.exercises.get('builtin-cable-lat-pulldown')).toBeTruthy()
    expect(await db.exercises.get('builtin-seated-wide-grip-cable-row')).toBeTruthy()
    db.close()
  })

  it('v11 adds pause timing fields without changing historical duration', async () => {
    const legacy = new Dexie('ironlog')
    legacy.version(1).stores({
      exercises: 'id, name, primaryMuscle, isCustom',
      routines: 'id, position',
      routineExercises: 'id, routineId, exerciseId',
      workouts: 'id, startedAt, completedAt',
      workoutExercises: 'id, workoutId, exerciseId',
      sets: 'id, workoutId, workoutExerciseId',
      settings: 'id',
    })
    legacy.version(2).stores({ bodyWeight: 'id, measuredAt' })
    legacy.version(3).stores({})
    legacy.version(4).stores({})
    legacy.version(5).stores({})
    legacy.version(6).stores({})
    legacy.version(7).stores({ syncState: 'table' })
    legacy.version(8).stores({})
    legacy.version(9).stores({ deviceState: 'key' })
    legacy.version(10).stores({})
    await legacy.open()

    const startedAt = '2026-07-19T10:00:00.000Z'
    const completedAt = '2026-07-19T11:15:00.000Z'
    await legacy.table('workouts').add({
      id: 'legacy-workout',
      name: 'Legacy workout',
      routineId: null,
      startedAt,
      completedAt,
      notes: '',
      createdAt: startedAt,
      updatedAt: completedAt,
      deletedAt: null,
    })
    legacy.close()

    const { db } = await import('./db')
    await db.open()
    expect(await db.workouts.get('legacy-workout')).toMatchObject({
      lastActivityAt: completedAt,
      pausedAt: null,
      pausedDurationMs: 0,
    })
    db.close()
  })

  it('v12 treats routines from older builds as already saved', async () => {
    const legacy = new Dexie('ironlog')
    legacy.version(1).stores({
      exercises: 'id, name, primaryMuscle, isCustom',
      routines: 'id, position',
      routineExercises: 'id, routineId, exerciseId',
      workouts: 'id, startedAt, completedAt',
      workoutExercises: 'id, workoutId, exerciseId',
      sets: 'id, workoutId, workoutExerciseId',
      settings: 'id',
    })
    legacy.version(2).stores({ bodyWeight: 'id, measuredAt' })
    legacy.version(3).stores({})
    legacy.version(4).stores({})
    legacy.version(5).stores({})
    legacy.version(6).stores({})
    legacy.version(7).stores({ syncState: 'table' })
    legacy.version(8).stores({})
    legacy.version(9).stores({ deviceState: 'key' })
    legacy.version(10).stores({})
    legacy.version(11).stores({})
    await legacy.open()

    const createdAt = '2026-07-20T10:00:00.000Z'
    await legacy.table('routines').add({
      id: 'legacy-saved-routine',
      name: 'Existing routine',
      position: 0,
      createdAt,
      updatedAt: '2026-07-21T10:00:00.000Z',
      deletedAt: null,
    })
    legacy.close()

    const { db } = await import('./db')
    await db.open()
    expect((await db.routines.get('legacy-saved-routine'))?.savedAt).toBe(createdAt)
    db.close()
  })

  it('v16 enables daily weight reminders without changing sync order', async () => {
    const legacy = new Dexie('ironlog')
    legacy.version(15).stores({
      exercises: 'id, name, primaryMuscle, isCustom',
      routines: 'id, position',
      routineExercises: 'id, routineId, exerciseId',
      workouts: 'id, startedAt, completedAt',
      workoutExercises: 'id, workoutId, exerciseId',
      sets: 'id, workoutId, workoutExerciseId',
      settings: 'id',
      bodyWeight: 'id, measuredAt',
      syncState: 'table',
      deviceState: 'key',
      cardioEntries: 'id, workoutId, workoutExerciseId, done, updatedAt',
    })
    await legacy.open()

    const updatedAt = '2026-07-20T10:00:00.000Z'
    await legacy.table('settings').add({
      id: 'app',
      theme: 'system',
      unit: 'kg',
      restSeconds: 90,
      incrementKg: 2.5,
      incrementLb: 5,
      updatedAt,
    })
    legacy.close()

    const { db } = await import('./db')
    await db.open()
    expect(await db.settings.get('app')).toMatchObject({
      dailyWeightReminder: true,
      updatedAt,
    })
    db.close()
  })

  it('v17 canonicalizes legacy Strong exercise ids without losing references', async () => {
    const legacy = new Dexie('ironlog')
    legacy.version(16).stores({
      exercises: 'id, name, primaryMuscle, isCustom',
      routines: 'id, position',
      routineExercises: 'id, routineId, exerciseId',
      workouts: 'id, startedAt, completedAt',
      workoutExercises: 'id, workoutId, exerciseId',
      sets: 'id, workoutId, workoutExerciseId',
      settings: 'id',
      bodyWeight: 'id, measuredAt',
      syncState: 'table',
      deviceState: 'key',
      cardioEntries: 'id, workoutId, workoutExerciseId, done, updatedAt',
    })
    await legacy.open()

    const old = '2026-07-21T12:00:00.000Z'
    await legacy.table('exercises').bulkAdd([
      {
        id: 'strong-chest-press-machine',
        name: 'Chest Press',
        primaryMuscle: 'chest',
        secondaryMuscles: [],
        isCustom: 1,
        trackingType: 'strength',
        createdAt: old,
        updatedAt: old,
        deletedAt: null,
      },
      {
        id: 'strong-chest-press-band',
        name: 'Chest Press',
        primaryMuscle: 'chest',
        secondaryMuscles: [],
        isCustom: 1,
        trackingType: 'strength',
        createdAt: old,
        updatedAt: old,
        deletedAt: null,
      },
    ])
    await legacy.table('routineExercises').add({
      id: 'legacy-routine-exercise',
      routineId: 'routine-1',
      exerciseId: 'strong-chest-press-band',
      position: 0,
      targetSets: 3,
      repMin: 8,
      repMax: 12,
      restSeconds: 90,
      createdAt: old,
      updatedAt: old,
      deletedAt: null,
    })
    await legacy.table('workoutExercises').add({
      id: 'legacy-workout-exercise',
      workoutId: 'workout-1',
      exerciseId: 'strong-chest-press-machine',
      position: 0,
      notes: '',
      restSeconds: 90,
      createdAt: old,
      updatedAt: old,
      deletedAt: null,
    })
    legacy.close()

    const { db } = await import('./db')
    await db.open()

    expect(await db.exercises.get('builtin-machine-chest-press')).toBeTruthy()
    expect(await db.exercises.get('builtin-band-chest-press')).toBeTruthy()
    expect(
      (await db.exercises.get('strong-chest-press-machine'))?.deletedAt,
    ).not.toBeNull()
    expect(
      (await db.exercises.get('strong-chest-press-band'))?.deletedAt,
    ).not.toBeNull()
    expect(
      (await db.routineExercises.get('legacy-routine-exercise'))?.exerciseId,
    ).toBe('builtin-band-chest-press')
    expect(
      (await db.workoutExercises.get('legacy-workout-exercise'))?.exerciseId,
    ).toBe('builtin-machine-chest-press')
    db.close()
  })

  it('v18 reconciles legacy sync cursors without removing training data', async () => {
    const legacy = new Dexie('ironlog')
    legacy.version(17).stores({
      exercises: 'id, name, primaryMuscle, isCustom',
      routines: 'id, position',
      routineExercises: 'id, routineId, exerciseId',
      workouts: 'id, startedAt, completedAt',
      workoutExercises: 'id, workoutId, exerciseId',
      sets: 'id, workoutId, workoutExerciseId',
      settings: 'id',
      bodyWeight: 'id, measuredAt',
      syncState: 'table',
      deviceState: 'key',
      cardioEntries: 'id, workoutId, workoutExerciseId, done, updatedAt',
    })
    await legacy.open()

    const timestamp = '2026-07-24T10:00:00.000Z'
    await legacy.table('workouts').add({
      id: 'preserved-workout',
      name: 'Imported session',
      routineId: null,
      startedAt: timestamp,
      lastActivityAt: timestamp,
      pausedAt: null,
      pausedDurationMs: 0,
      completedAt: timestamp,
      notes: '',
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    })
    await legacy.table('syncState').add({
      table: 'workoutExercises',
      pullCursor: timestamp,
      pushCursor: timestamp,
    })
    legacy.close()

    const { db } = await import('./db')
    await db.open()

    expect(await db.workouts.get('preserved-workout')).toBeTruthy()
    expect(await db.syncState.get('workoutExercises')).toEqual({
      table: 'workoutExercises',
      pullCursor: '1970-01-01T00:00:00.000Z',
      pullCursorId: '',
      pushCursor: '1970-01-01T00:00:00.000Z',
      pushCursorId: '',
    })
    db.close()
  })
})
