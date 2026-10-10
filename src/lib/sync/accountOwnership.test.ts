import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/db'
import {
  ensureLocalOwner,
  getLocalOwnerId,
  getLocalTrainingSummary,
  resetLocalDataForUser,
} from './accountOwnership'

beforeEach(async () => {
  await db.open()
  await Promise.all([
    db.deviceState.clear(),
    db.syncState.clear(),
    db.workouts.clear(),
  ])
})

describe('local account ownership', () => {
  it('claims an unsynced install once and blocks another account', async () => {
    await expect(ensureLocalOwner('user-a')).resolves.toBe('claimed')
    await expect(ensureLocalOwner('user-a')).resolves.toBe('ready')
    await expect(ensureLocalOwner('user-b')).resolves.toBe('differentAccount')
    await expect(getLocalOwnerId()).resolves.toBe('user-a')
  })

  it('does not guess the owner of legacy cloud-synced data', async () => {
    await db.syncState.put({
      table: 'workouts',
      pullCursor: '2026-07-19T10:00:00.000Z',
      pullCursorId: 'workout-1',
      pushCursor: '2026-07-19T10:00:00.000Z',
      pushCursorId: 'workout-1',
    })

    await expect(ensureLocalOwner('user-a')).resolves.toBe('unclaimedSyncedData')
    await expect(getLocalOwnerId()).resolves.toBeNull()
  })

  it('pauses before assigning meaningful phone data to a first account', async () => {
    const timestamp = '2026-07-19T10:00:00.000Z'
    await db.workouts.add({
      id: 'local-workout',
      name: 'Phone workout',
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

    await expect(ensureLocalOwner('user-a')).resolves.toBe('unclaimedLocalData')
    await expect(getLocalOwnerId()).resolves.toBeNull()
    await expect(getLocalTrainingSummary()).resolves.toMatchObject({
      workouts: 1,
      hasTrainingData: true,
    })
  })

  it('does not treat built-in exercises and example routines as phone data', async () => {
    await resetLocalDataForUser('temporary-owner')
    await db.deviceState.clear()

    await expect(ensureLocalOwner('user-a')).resolves.toBe('claimed')
    await expect(getLocalOwnerId()).resolves.toBe('user-a')
  })

  it('replaces local data with old fallback seeds for a different account', async () => {
    const timestamp = '2026-07-19T10:00:00.000Z'
    await db.workouts.add({
      id: 'old-workout',
      name: 'Old account workout',
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
    await db.deviceState.put({ key: 'syncOwner', value: 'user-a' })

    await resetLocalDataForUser('user-b')

    expect(await db.workouts.count()).toBe(0)
    expect(await db.exercises.count()).toBeGreaterThan(20)
    expect(await db.routines.count()).toBe(4)
    expect((await db.settings.get('app'))?.updatedAt).toBe('1970-01-01T00:00:00.001Z')
    await expect(getLocalOwnerId()).resolves.toBe('user-b')
  })
})
