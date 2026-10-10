import Dexie, { type EntityTable } from 'dexie'
import { matchLegacyExercise } from '../lib/exerciseIdentity'
import { builtinExercises, isStarterRoutineId, starterRoutines } from './seed'
import type {
  BodyWeight,
  CardioEntry,
  DeviceState,
  Exercise,
  Routine,
  RoutineExercise,
  SetEntry,
  Settings,
  SyncState,
  Workout,
  WorkoutExercise,
} from './types'

export const newId = () => crypto.randomUUID()
export const nowIso = () => new Date().toISOString()

/** Fields shared by every syncable row. */
export function baseRow() {
  const now = nowIso()
  return { id: newId(), createdAt: now, updatedAt: now, deletedAt: null }
}

export const defaultSettings: Settings = {
  id: 'app',
  theme: 'system',
  unit: 'kg',
  restSeconds: 90,
  dailyWeightReminder: true,
  incrementKg: 2.5,
  incrementLb: 5,
  updatedAt: '',
}

// App is branded "GymTrack"; the IndexedDB name keeps its original value —
// renaming it would orphan every existing install's local data.
export const db = new Dexie('ironlog') as Dexie & {
  exercises: EntityTable<Exercise, 'id'>
  routines: EntityTable<Routine, 'id'>
  routineExercises: EntityTable<RoutineExercise, 'id'>
  workouts: EntityTable<Workout, 'id'>
  workoutExercises: EntityTable<WorkoutExercise, 'id'>
  sets: EntityTable<SetEntry, 'id'>
  cardioEntries: EntityTable<CardioEntry, 'id'>
  settings: EntityTable<Settings, 'id'>
  bodyWeight: EntityTable<BodyWeight, 'id'>
  syncState: EntityTable<SyncState, 'table'>
  deviceState: EntityTable<DeviceState, 'key'>
}

db.version(1).stores({
  exercises: 'id, name, primaryMuscle, isCustom',
  routines: 'id, position',
  routineExercises: 'id, routineId, exerciseId',
  workouts: 'id, startedAt, completedAt',
  workoutExercises: 'id, workoutId, exerciseId',
  sets: 'id, workoutId, workoutExerciseId',
  settings: 'id',
})

db.version(2).stores({
  bodyWeight: 'id, measuredAt',
})

// Populate was expanded after v2; an upgrader is required for existing installs.
db.version(3).stores({}).upgrade(async (tx) => {
  const now = nowIso()
  const routineTable = tx.table<Routine, string>('routines')
  const routineExerciseTable = tx.table<RoutineExercise, string>('routineExercises')
  const existing = await routineTable.toArray()
  const nextPosition = existing.reduce(
    (max, routine) => Math.max(max, routine.position + 1),
    0,
  )
  const starters = starterRoutines(now, nextPosition)
  const existingIds = new Set(existing.map((routine) => routine.id))
  const missingRoutines = starters.routines.filter(
    (routine) => !existingIds.has(routine.id),
  )
  const missingIds = new Set(missingRoutines.map((routine) => routine.id))

  await routineTable.bulkAdd(missingRoutines)
  await routineExerciseTable.bulkAdd(
    starters.routineExercises.filter((entry) => missingIds.has(entry.routineId)),
  )
})

// Starter routines became immutable examples in v4. Preserve meaningful edits
// as personal copies, then restore each canonical example in place.
db.version(4).stores({}).upgrade(async (tx) => {
  const now = nowIso()
  const routineTable = tx.table<Routine, string>('routines')
  const routineExerciseTable = tx.table<RoutineExercise, string>('routineExercises')
  const [storedRoutines, storedEntries] = await Promise.all([
    routineTable.toArray(),
    routineExerciseTable.toArray(),
  ])
  let nextPosition = storedRoutines.reduce(
    (max, routine) => Math.max(max, routine.position + 1),
    0,
  )
  const canonical = starterRoutines(now)

  for (const template of canonical.routines) {
    const existing = storedRoutines.find((routine) => routine.id === template.id)
    const currentItems = storedEntries
      .filter((entry) => entry.routineId === template.id && !entry.deletedAt)
      .sort((a, b) => a.position - b.position)
    const canonicalItems = canonical.routineExercises
      .filter((entry) => entry.routineId === template.id)
      .sort((a, b) => a.position - b.position)
    const itemsMatch =
      currentItems.length === canonicalItems.length &&
      currentItems.every((entry, index) => {
        const expected = canonicalItems[index]
        return (
          entry.exerciseId === expected.exerciseId &&
          entry.position === expected.position &&
          entry.targetSets === expected.targetSets &&
          entry.repMin === expected.repMin &&
          entry.repMax === expected.repMax &&
          (entry.restSeconds ?? expected.restSeconds) === expected.restSeconds
        )
      })
    const changed =
      !existing || Boolean(existing.deletedAt) || existing.name !== template.name || !itemsMatch

    if (existing && changed && currentItems.length > 0) {
      const savedId = newId()
      await routineTable.add({
        id: savedId,
        name: `${existing.name} (saved copy)`,
        position: nextPosition++,
        savedAt: now,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      await routineExerciseTable.bulkAdd(
        currentItems.map((entry, position) => ({
          id: newId(),
          routineId: savedId,
          exerciseId: entry.exerciseId,
          position,
          targetSets: entry.targetSets,
          repMin: entry.repMin,
          repMax: entry.repMax,
          restSeconds: entry.restSeconds ?? defaultSettings.restSeconds,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })),
      )
    }

    await routineTable.put({
      ...template,
      position: existing?.position ?? nextPosition++,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    })
    await routineExerciseTable.where('routineId').equals(template.id).delete()
    await routineExerciseTable.bulkAdd(canonicalItems)
  }
})

// Empty personal routines were previously persisted as if they were complete.
// They are invalid drafts from v5 onward, so retire existing ones softly.
db.version(5).stores({}).upgrade(async (tx) => {
  const now = nowIso()
  const routineTable = tx.table<Routine, string>('routines')
  const routineExerciseTable = tx.table<RoutineExercise, string>('routineExercises')
  const [routines, entries] = await Promise.all([
    routineTable.toArray(),
    routineExerciseTable.toArray(),
  ])
  const routineIdsWithExercises = new Set(
    entries.filter((entry) => !entry.deletedAt).map((entry) => entry.routineId),
  )
  const emptyPersonalIds = routines
    .filter(
      (routine) =>
        !routine.deletedAt &&
        !isStarterRoutineId(routine.id) &&
        !routineIdsWithExercises.has(routine.id),
    )
    .map((routine) => routine.id)

  await Promise.all(
    emptyPersonalIds.map((id) =>
      routineTable.update(id, { deletedAt: now, updatedAt: now }),
    ),
  )
})

// Rest duration became an explicit per-exercise plan in v6. Existing personal
// rows inherit the user's default; immutable examples receive their canonical
// durations. Active and historical workout rows retain a self-contained value.
db.version(6).stores({}).upgrade(async (tx) => {
  const settings = await tx.table<Settings, string>('settings').get('app')
  const fallback = settings?.restSeconds ?? defaultSettings.restSeconds
  const canonical = new Map(
    starterRoutines(nowIso()).routineExercises.map((entry) => [entry.id, entry]),
  )
  const routineExerciseTable = tx.table<RoutineExercise, string>('routineExercises')
  const workoutExerciseTable = tx.table<WorkoutExercise, string>('workoutExercises')

  await routineExerciseTable.toCollection().modify((entry) => {
    const example = isStarterRoutineId(entry.routineId)
      ? canonical.get(entry.id)
      : undefined
    if (example) entry.restSeconds = example.restSeconds
    else if (!Number.isFinite(entry.restSeconds)) entry.restSeconds = fallback
  })
  await workoutExerciseTable.toCollection().modify((entry) => {
    if (!Number.isFinite(entry.restSeconds)) entry.restSeconds = fallback
  })
})

// Phase 5: per-table sync cursors for the Supabase backup engine.
db.version(7).stores({
  syncState: 'table',
})

// 2026-07 library expansion: add new builtin exercises to existing installs.
// Skips any whose (normalized) name is already taken — including custom
// exercises created by the Strong importer — so nothing shows up twice.
db.version(8).stores({}).upgrade(async (tx) => {
  const table = tx.table<Exercise, string>('exercises')
  const existing = await table.toArray()
  const existingIds = new Set(existing.map((e) => e.id))
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const existingNames = new Set(
    existing.filter((e) => !e.deletedAt).map((e) => normalize(e.name)),
  )
  const missing = builtinExercises(nowIso()).filter(
    (e) => !existingIds.has(e.id) && !existingNames.has(normalize(e.name)),
  )
  await table.bulkAdd(missing)
})

// Bind the local dataset to one Supabase user so changing accounts can never
// upload one person's training history into another person's account.
db.version(9).stores({
  deviceState: 'key',
})

// Appearance became user-selectable in v10. Existing installs keep following
// the iPhone setting until the user explicitly chooses light or dark.
db.version(10).stores({}).upgrade(async (tx) => {
  const table = tx.table<Settings, string>('settings')
  const settings = await table.get('app')
  if (settings && !settings.theme) {
    await table.update('app', { theme: 'system', updatedAt: nowIso() })
  }
})

// Workouts gained a durable pause clock in v11. Completed sessions preserve
// their historical wall-clock duration, while unfinished sessions use their
// last workout-row update as the safest available activity fallback.
db.version(11).stores({}).upgrade(async (tx) => {
  const table = tx.table<Workout, string>('workouts')
  await table.toCollection().modify((workout) => {
    if (!workout.lastActivityAt) {
      workout.lastActivityAt = workout.completedAt ?? workout.updatedAt ?? workout.startedAt
    }
    if (workout.pausedAt === undefined) workout.pausedAt = null
    if (!Number.isFinite(workout.pausedDurationMs) || workout.pausedDurationMs < 0) {
      workout.pausedDurationMs = 0
    }
  })
})

// New routines remain recoverable drafts until the user explicitly saves or
// starts them. Every routine created by an older build was already treated as
// saved, so preserve that behavior during the v12 upgrade.
db.version(12).stores({}).upgrade(async (tx) => {
  const table = tx.table<Routine, string>('routines')
  await table.toCollection().modify((routine) => {
    if (routine.savedAt === undefined) {
      routine.savedAt = routine.createdAt ?? routine.updatedAt ?? nowIso()
    }
  })
})

// Preserve the equipment-specific movements used most often in Strong imports.
// Existing exercise rows and history stay untouched; only missing builtins arrive.
db.version(13).stores({}).upgrade(async (tx) => {
  const table = tx.table<Exercise, string>('exercises')
  const existing = await table.toArray()
  const existingIds = new Set(existing.map((exercise) => exercise.id))
  const normalize = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const existingNames = new Set(
    existing
      .filter((exercise) => !exercise.deletedAt)
      .map((exercise) => normalize(exercise.name)),
  )
  const missing = builtinExercises(nowIso()).filter(
    (exercise) =>
      !existingIds.has(exercise.id) &&
      !existingNames.has(normalize(exercise.name)),
  )
  await table.bulkAdd(missing)
})

// Add the guide-backed machine chest fly to existing installations without
// modifying any user-created exercise rows.
db.version(14).stores({}).upgrade(async (tx) => {
  const table = tx.table<Exercise, string>('exercises')
  const exercise = builtinExercises(nowIso()).find(
    (entry) => entry.id === 'builtin-machine-chest-fly',
  )
  if (exercise && !(await table.get(exercise.id))) await table.add(exercise)
})

db.version(15).stores({
  cardioEntries: 'id, workoutId, workoutExerciseId, done, updatedAt',
}).upgrade(async (tx) => {
  const exerciseTable = tx.table<Exercise, string>('exercises')
  await exerciseTable.toCollection().modify((exercise) => {
    if (!exercise.trackingType) exercise.trackingType = 'strength'
  })
  const cardioExercises = builtinExercises(nowIso()).filter(
    (exercise) => exercise.trackingType === 'cardio',
  )
  for (const exercise of cardioExercises) {
    if (!(await exerciseTable.get(exercise.id))) await exerciseTable.add(exercise)
  }
  await tx
    .table<RoutineExercise, string>('routineExercises')
    .toCollection()
    .modify((entry) => {
      if (!Number.isFinite(entry.targetDurationSeconds)) entry.targetDurationSeconds = 0
      if (!Number.isFinite(entry.targetDistanceMeters)) entry.targetDistanceMeters = 0
    })
})

// Daily weight reminders are enabled by default. Preserve the settings row's
// timestamp so an older device upgrade cannot outrank a newer synced choice.
db.version(16).stores({}).upgrade(async (tx) => {
  const table = tx.table<Settings, string>('settings')
  const settings = await table.get('app')
  if (settings && settings.dailyWeightReminder === undefined) {
    await table.update('app', { dailyWeightReminder: true })
  }
})

// Older Strong imports could create a second exercise id for a movement that
// now has a canonical built-in. Move every reference to that canonical parent
// and retire only the redundant exercise row; workout and routine data remain.
db.version(17).stores({}).upgrade(async (tx) => {
  const now = nowIso()
  const exerciseTable = tx.table<Exercise, string>('exercises')
  const routineExerciseTable = tx.table<RoutineExercise, string>(
    'routineExercises',
  )
  const workoutExerciseTable = tx.table<WorkoutExercise, string>(
    'workoutExercises',
  )
  const canonical = builtinExercises(now)
  const existing = await exerciseTable.toArray()
  const existingIds = new Set(existing.map((exercise) => exercise.id))
  const missing = canonical.filter((exercise) => !existingIds.has(exercise.id))
  if (missing.length) await exerciseTable.bulkAdd(missing)

  for (const legacy of existing) {
    if (!legacy.id.startsWith('strong-')) continue
    const canonicalId = matchLegacyExercise(legacy, canonical)
    if (!canonicalId || canonicalId === legacy.id) continue

    await Promise.all([
      routineExerciseTable
        .where('exerciseId')
        .equals(legacy.id)
        .modify({ exerciseId: canonicalId, updatedAt: now }),
      workoutExerciseTable
        .where('exerciseId')
        .equals(legacy.id)
        .modify({ exerciseId: canonicalId, updatedAt: now }),
    ])
    await exerciseTable.update(legacy.id, {
      updatedAt: now,
      deletedAt: now,
    })
  }
})

// Timestamp-only sync pagination could skip rows when a large import gave
// hundreds of records the same updatedAt value. Reconcile every table once
// under the stable (updatedAt, id) cursor without deleting any local data.
db.version(18).stores({}).upgrade(async (tx) => {
  const table = tx.table<SyncState, string>('syncState')
  await table.toCollection().modify((state) => {
    state.pullCursor = '1970-01-01T00:00:00.000Z'
    state.pullCursorId = ''
    state.pushCursor = '1970-01-01T00:00:00.000Z'
    state.pushCursorId = ''
  })
})

db.on('populate', async (tx) => {
  const now = nowIso()
  const starters = starterRoutines(now)
  await Promise.all([
    tx.table('exercises').bulkAdd(builtinExercises(now)),
    tx.table('settings').add({ ...defaultSettings, updatedAt: now }),
    tx.table('routines').bulkAdd(starters.routines),
    tx.table('routineExercises').bulkAdd(starters.routineExercises),
  ])
})
