import { db, defaultSettings } from '../../db/db'
import { builtinExercises, starterRoutines } from '../../db/seed'

const OWNER_KEY = 'syncOwner' as const
const RESET_SEED_TIME = '1970-01-01T00:00:00.001Z'
const STARTER_ROUTINE_IDS = new Set(
  starterRoutines(RESET_SEED_TIME).routines.map((routine) => routine.id),
)

export type OwnershipCheck =
  | 'ready'
  | 'claimed'
  | 'differentAccount'
  | 'unclaimedLocalData'
  | 'unclaimedSyncedData'

export interface LocalTrainingSummary {
  workouts: number
  routines: number
  weighIns: number
  customExercises: number
  hasTrainingData: boolean
}

async function readLocalTrainingSummary(): Promise<LocalTrainingSummary> {
  const [
    workouts,
    routines,
    routineExercises,
    workoutExercises,
    sets,
    cardioEntries,
    weighIns,
    customExercises,
  ] = await Promise.all([
    db.workouts.filter((row) => !row.deletedAt).count(),
    db.routines
      .filter((row) => !row.deletedAt && !STARTER_ROUTINE_IDS.has(row.id))
      .count(),
    db.routineExercises
      .filter((row) => !row.deletedAt && !STARTER_ROUTINE_IDS.has(row.routineId))
      .count(),
    db.workoutExercises.filter((row) => !row.deletedAt).count(),
    db.sets.filter((row) => !row.deletedAt).count(),
    db.cardioEntries.filter((row) => !row.deletedAt).count(),
    db.bodyWeight.filter((row) => !row.deletedAt).count(),
    db.exercises.filter((row) => !row.deletedAt && row.isCustom === 1).count(),
  ])

  return {
    workouts,
    routines,
    weighIns,
    customExercises,
    hasTrainingData:
      workouts +
        routines +
        routineExercises +
        workoutExercises +
        sets +
        cardioEntries +
        weighIns +
        customExercises >
      0,
  }
}

/** Summarize meaningful phone data without counting built-in seed content. */
export async function getLocalTrainingSummary(): Promise<LocalTrainingSummary> {
  return db.transaction(
    'r',
    [
      db.exercises,
      db.routines,
      db.routineExercises,
      db.workouts,
      db.workoutExercises,
      db.sets,
      db.cardioEntries,
      db.bodyWeight,
    ],
    readLocalTrainingSummary,
  )
}

/**
 * Bind a seed-only install on first sign-in, or stop sync before meaningful
 * unowned data can be uploaded without the user's choice.
 */
export async function ensureLocalOwner(userId: string): Promise<OwnershipCheck> {
  return db.transaction(
    'rw',
    [
      db.deviceState,
      db.syncState,
      db.exercises,
      db.routines,
      db.routineExercises,
      db.workouts,
      db.workoutExercises,
      db.sets,
      db.cardioEntries,
      db.bodyWeight,
    ],
    async () => {
      const owner = await db.deviceState.get(OWNER_KEY)
      if (owner?.value === userId) return 'ready'
      if (owner) return 'differentAccount'

      // A cursor proves this install synced before device ownership was added.
      // Do not guess which account owned it; require an explicit confirmation.
      if ((await db.syncState.count()) > 0) return 'unclaimedSyncedData'

      if ((await readLocalTrainingSummary()).hasTrainingData) {
        return 'unclaimedLocalData'
      }

      await db.deviceState.put({ key: OWNER_KEY, value: userId })
      return 'claimed'
    },
  )
}

/** Bind existing phone data only after the user explicitly chooses to keep it. */
export async function keepLocalDataForUser(userId: string): Promise<void> {
  await db.deviceState.put({ key: OWNER_KEY, value: userId })
}

/**
 * Replace this device's local dataset for a different account. Seed rows use
 * an intentionally old timestamp: a returning user's cloud copy always wins,
 * while a genuinely new account still receives the exercise library/plans.
 */
export async function resetLocalDataForUser(userId: string): Promise<void> {
  const starter = starterRoutines(RESET_SEED_TIME)
  await db.transaction(
    'rw',
    [
      db.exercises,
      db.routines,
      db.routineExercises,
      db.workouts,
      db.workoutExercises,
      db.sets,
      db.cardioEntries,
      db.settings,
      db.bodyWeight,
      db.syncState,
      db.deviceState,
    ],
    async () => {
      await Promise.all([
        db.exercises.clear(),
        db.routines.clear(),
        db.routineExercises.clear(),
        db.workouts.clear(),
        db.workoutExercises.clear(),
        db.sets.clear(),
        db.cardioEntries.clear(),
        db.settings.clear(),
        db.bodyWeight.clear(),
        db.syncState.clear(),
        db.deviceState.clear(),
      ])
      await Promise.all([
        db.exercises.bulkAdd(builtinExercises(RESET_SEED_TIME)),
        db.routines.bulkAdd(starter.routines),
        db.routineExercises.bulkAdd(starter.routineExercises),
        db.settings.add({ ...defaultSettings, updatedAt: RESET_SEED_TIME }),
        db.deviceState.add({ key: OWNER_KEY, value: userId }),
      ])
    },
  )
}

export async function getLocalOwnerId(): Promise<string | null> {
  return (await db.deviceState.get(OWNER_KEY))?.value ?? null
}
