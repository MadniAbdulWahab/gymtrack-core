import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/db'
import type { SetEntry } from '../../db/types'
import {
  applyRemoteRows,
  pullTablePages,
  pushTablePages,
  rowsToPush,
  type SyncCursor,
} from './engine'
import { tableMappings } from './mappings'

const setsMapping = tableMappings.find((m) => m.local === 'sets')!

const sampleSet: SetEntry = {
  id: 'set-1',
  workoutId: 'w1',
  workoutExerciseId: 'we1',
  position: 0,
  type: 'working',
  weight: 135,
  unit: 'lb',
  weightKg: 61.23,
  reps: 5,
  done: 1,
  createdAt: '2026-07-19T10:00:00.000Z',
  updatedAt: '2026-07-19T10:05:00.000Z',
  deletedAt: null,
}

beforeEach(async () => {
  await db.open()
  await db.sets.clear()
  await db.syncState.clear()
})

describe('mappings', () => {
  it('round-trips every table mapping through remote shape', () => {
    const samples: Record<string, object> = {
      exercises: {
        id: 'builtin-back-squat',
        name: 'Back Squat',
        primaryMuscle: 'quads',
        secondaryMuscles: ['glutes', 'core'],
        isCustom: 0,
        trackingType: 'strength',
        createdAt: sampleSet.createdAt,
        updatedAt: sampleSet.updatedAt,
        deletedAt: null,
      },
      routines: {
        id: 'routine-draft-1',
        name: 'New routine',
        position: 0,
        savedAt: null,
        createdAt: sampleSet.createdAt,
        updatedAt: sampleSet.updatedAt,
        deletedAt: null,
      },
      sets: sampleSet,
      workouts: {
        id: 'workout-1',
        name: 'Upper day',
        routineId: null,
        startedAt: sampleSet.createdAt,
        lastActivityAt: sampleSet.updatedAt,
        pausedAt: '2026-07-19T10:10:00.000Z',
        pausedDurationMs: 120_000,
        completedAt: null,
        notes: '',
        createdAt: sampleSet.createdAt,
        updatedAt: sampleSet.updatedAt,
        deletedAt: null,
      },
      cardioEntries: {
        id: 'cardio-1',
        workoutId: 'workout-1',
        workoutExerciseId: 'workout-exercise-1',
        startedAt: sampleSet.createdAt,
        endedAt: sampleSet.updatedAt,
        pausedAt: null,
        pausedDurationMs: 15_000,
        durationSeconds: 1200,
        distanceMeters: 4200,
        calories: 250,
        incline: 2,
        resistance: 0,
        done: 1,
        createdAt: sampleSet.createdAt,
        updatedAt: sampleSet.updatedAt,
        deletedAt: null,
      },
      settings: {
        id: 'app',
        theme: 'system',
        unit: 'kg',
        restSeconds: 90,
        dailyWeightReminder: true,
        incrementKg: 2.5,
        incrementLb: 5,
        updatedAt: sampleSet.updatedAt,
      },
    }
    for (const [local, row] of Object.entries(samples)) {
      const mapping = tableMappings.find((m) => m.local === local)!
      const back = mapping.toLocal(mapping.toRemote(row as never))
      expect(back, local).toEqual(row)
    }
  })

  it('converts done and isCustom to booleans for Postgres', () => {
    const remote = setsMapping.toRemote(sampleSet as never)
    expect(remote.done).toBe(true)
    expect(remote.unit).toBe('lb')
    expect(remote.workout_exercise_id).toBe('we1')
  })
})

describe('applyRemoteRows (last-write-wins)', () => {
  it('applies newer remote rows and keeps newer local rows', async () => {
    await db.sets.add(sampleSet)

    const older = setsMapping.toRemote({
      ...sampleSet,
      reps: 3,
      updatedAt: '2026-07-19T09:00:00.000Z',
    } as never)
    const newer = setsMapping.toRemote({
      ...sampleSet,
      reps: 8,
      updatedAt: '2026-07-19T11:00:00.000Z',
    } as never)

    await applyRemoteRows(setsMapping, [older])
    expect((await db.sets.get('set-1'))!.reps).toBe(5) // local wins

    await applyRemoteRows(setsMapping, [newer])
    expect((await db.sets.get('set-1'))!.reps).toBe(8) // remote wins
  })

  it('inserts rows that do not exist locally (restore path)', async () => {
    await applyRemoteRows(setsMapping, [setsMapping.toRemote(sampleSet as never)])
    expect(await db.sets.get('set-1')).toMatchObject({ reps: 5, done: 1 })
  })
})

describe('rowsToPush', () => {
  it('returns only rows changed after the cursor, oldest first', async () => {
    await db.sets.bulkAdd([
      sampleSet,
      { ...sampleSet, id: 'set-2', updatedAt: '2026-07-19T12:00:00.000Z' },
      { ...sampleSet, id: 'set-3', updatedAt: '2026-07-19T08:00:00.000Z' },
    ])
    const rows = await rowsToPush(setsMapping, {
      updatedAt: '2026-07-19T09:00:00.000Z',
      id: '',
    })
    expect(rows.map((r) => (r as SetEntry).id)).toEqual(['set-1', 'set-2'])
  })

  it('uses the row id to resume safely inside a shared timestamp', async () => {
    await db.sets.bulkAdd([
      { ...sampleSet, id: 'set-a' },
      { ...sampleSet, id: 'set-b' },
      { ...sampleSet, id: 'set-c' },
    ])

    const rows = await rowsToPush(setsMapping, {
      updatedAt: sampleSet.updatedAt,
      id: 'set-a',
    })
    expect(rows.map((row) => row.id)).toEqual(['set-b', 'set-c'])
  })
})

describe('keyset pagination', () => {
  const importedAt = '2026-07-19T10:05:00.000Z'
  const importedSets = Array.from({ length: 1_200 }, (_, index) => ({
    ...sampleSet,
    id: `set-${String(index).padStart(4, '0')}`,
    updatedAt: importedAt,
  }))

  it('restores every row when more than 500 share one timestamp', async () => {
    const remote = importedSets.map((row) =>
      setsMapping.toRemote(row as never),
    )
    const fetchPage = async (
      _mapping: typeof setsMapping,
      cursor: SyncCursor,
    ) =>
      remote
        .filter((row) => {
          const updatedAt = new Date(row.updated_at as string).toISOString()
          const id = String(row.id)
          return (
            updatedAt > cursor.updatedAt ||
            (updatedAt === cursor.updatedAt && id > cursor.id)
          )
        })
        .sort(
          (a, b) =>
            String(a.updated_at).localeCompare(String(b.updated_at)) ||
            String(a.id).localeCompare(String(b.id)),
        )
        .slice(0, 500)

    await pullTablePages(setsMapping, fetchPage)

    expect(await db.sets.count()).toBe(1_200)
    expect(await db.syncState.get('sets')).toMatchObject({
      pullCursor: importedAt,
      pullCursorId: 'set-1199',
    })
  })

  it('resumes an interrupted upload without skipping timestamp ties', async () => {
    await db.sets.bulkAdd(importedSets)
    const uploaded = new Set<string>()
    let call = 0

    await expect(
      pushTablePages(setsMapping, async (_mapping, rows) => {
        call += 1
        if (call === 2) throw new Error('temporary network failure')
        rows.forEach((row) => uploaded.add(row.id))
      }),
    ).rejects.toThrow('temporary network failure')

    expect(uploaded.size).toBe(500)
    expect(await db.syncState.get('sets')).toMatchObject({
      pushCursor: importedAt,
      pushCursorId: 'set-0499',
    })

    await pushTablePages(setsMapping, async (_mapping, rows) => {
      rows.forEach((row) => uploaded.add(row.id))
    })

    expect(uploaded.size).toBe(1_200)
    expect(await db.syncState.get('sets')).toMatchObject({
      pushCursor: importedAt,
      pushCursorId: 'set-1199',
    })
  })
})
