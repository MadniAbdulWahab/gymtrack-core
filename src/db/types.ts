export type Unit = 'kg' | 'lb'

export type ThemePreference = 'system' | 'light' | 'dark'

export type SetType = 'warmup' | 'working' | 'drop' | 'failure'
export type TrackingType = 'strength' | 'cardio'

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'

/**
 * Sync-ready row shape (phase 5): client UUIDs, ISO timestamps, soft delete.
 * Booleans are 0|1 so IndexedDB can index them.
 */
export interface BaseRow {
  id: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Exercise extends BaseRow {
  name: string
  primaryMuscle: MuscleGroup
  secondaryMuscles: MuscleGroup[]
  isCustom: 0 | 1
  trackingType?: TrackingType
}

export interface Routine extends BaseRow {
  name: string
  position: number
  /** null until a new routine is explicitly saved or started. */
  savedAt: string | null
}

export interface RoutineExercise extends BaseRow {
  routineId: string
  exerciseId: string
  position: number
  targetSets: number
  repMin: number
  repMax: number
  /** Automatic rest after a completed set; 0 disables it. */
  restSeconds: number
  targetDurationSeconds?: number
  targetDistanceMeters?: number
}

export interface Workout extends BaseRow {
  name: string
  routineId: string | null
  startedAt: string
  /** Last meaningful logging action used by the inactivity safeguard. */
  lastActivityAt: string
  /** Set while the workout timer is paused. */
  pausedAt: string | null
  /** Total time spent in earlier completed pause periods. */
  pausedDurationMs: number
  /** null while the workout is active */
  completedAt: string | null
  notes: string
}

export interface WorkoutExercise extends BaseRow {
  workoutId: string
  exerciseId: string
  position: number
  notes: string
  /** Workout-local rest duration so routine edits never alter an active session. */
  restSeconds: number
  /** Optional cardio targets copied from a routine when the workout starts. */
  targetDurationSeconds?: number
  targetDistanceMeters?: number
}

export interface SetEntry extends BaseRow {
  workoutId: string
  workoutExerciseId: string
  position: number
  type: SetType
  /** weight as entered, in `unit` */
  weight: number
  unit: Unit
  /** normalized for analytics */
  weightKg: number
  reps: number
  done: 0 | 1
}

export interface CardioEntry extends BaseRow {
  workoutId: string
  workoutExerciseId: string
  startedAt: string
  endedAt: string | null
  pausedAt: string | null
  pausedDurationMs: number
  durationSeconds: number
  distanceMeters: number
  calories: number
  incline: number
  resistance: number
  done: 0 | 1
}

export interface BodyWeight extends BaseRow {
  measuredAt: string
  /** as entered, in `unit` */
  weight: number
  unit: Unit
  weightKg: number
}

/** Per-table keyset cursors; local-only, never pushed. */
export interface SyncState {
  table: string
  /** newest remote updated_at applied locally */
  pullCursor: string
  /** remote row id at pullCursor (breaks timestamp ties) */
  pullCursorId: string
  /** newest local updatedAt confirmed pushed */
  pushCursor: string
  /** local row id at pushCursor (breaks timestamp ties) */
  pushCursorId: string
}

/** Local-only device metadata. Never uploaded to Supabase. */
export interface DeviceState {
  key: 'syncOwner'
  value: string
}

export interface Settings {
  id: 'app'
  theme: ThemePreference
  unit: Unit
  restSeconds: number
  dailyWeightReminder: boolean
  incrementKg: number
  incrementLb: number
  updatedAt: string
}
