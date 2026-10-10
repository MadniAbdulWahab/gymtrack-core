import { db, defaultSettings } from '../../db/db'
import type {
  BodyWeight,
  CardioEntry,
  Exercise,
  Routine,
  RoutineExercise,
  SetEntry,
  Settings,
  Workout,
  WorkoutExercise,
} from '../../db/types'
import { isThemePreference } from '../theme'

/** A row as sent to / received from Postgres (snake_case). */
export type RemoteRow = Record<string, unknown>

export interface TableMapping {
  /** Dexie table name */
  local: string
  /** Postgres table name */
  remote: string
  /** upsert conflict target */
  onConflict: string
  /** Stable remote tie-breaker for rows sharing updated_at. Defaults to id. */
  remoteCursorColumn?: string
  toRemote(row: never): RemoteRow
  toLocal(row: RemoteRow): { id: string; updatedAt: string }
}

const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString())

const base = (r: {
  id: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}) => ({
  id: r.id,
  created_at: r.createdAt,
  updated_at: r.updatedAt,
  deleted_at: r.deletedAt,
})

const localBase = (r: RemoteRow) => ({
  id: r.id as string,
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
  deletedAt: iso(r.deleted_at),
})

/**
 * Ordered parents-first so pushes never reference a row the server has not
 * seen (the schema has no cross-table FKs, but ordering keeps pulls coherent).
 */
export const tableMappings: TableMapping[] = [
  {
    local: 'exercises',
    remote: 'exercises',
    onConflict: 'user_id,id',
    toRemote: (r: Exercise) => ({
      ...base(r),
      name: r.name,
      primary_muscle: r.primaryMuscle,
      secondary_muscles: r.secondaryMuscles,
      is_custom: Boolean(r.isCustom),
      tracking_type: r.trackingType ?? 'strength',
    }),
    toLocal: (r) =>
      ({
        ...localBase(r),
        name: r.name,
        primaryMuscle: r.primary_muscle,
        secondaryMuscles: r.secondary_muscles ?? [],
        isCustom: r.is_custom ? 1 : 0,
        trackingType: r.tracking_type === 'cardio' ? 'cardio' : 'strength',
      }) as Exercise,
  },
  {
    local: 'routines',
    remote: 'routines',
    onConflict: 'user_id,id',
    toRemote: (r: Routine) => ({
      ...base(r),
      name: r.name,
      position: r.position,
      saved_at: r.savedAt,
    }),
    toLocal: (r) =>
      ({
        ...localBase(r),
        name: r.name,
        position: r.position,
        savedAt: r.saved_at === undefined ? iso(r.created_at) : iso(r.saved_at),
      }) as Routine,
  },
  {
    local: 'routineExercises',
    remote: 'routine_exercises',
    onConflict: 'user_id,id',
    toRemote: (r: RoutineExercise) => ({
      ...base(r),
      routine_id: r.routineId,
      exercise_id: r.exerciseId,
      position: r.position,
      target_sets: r.targetSets,
      rep_min: r.repMin,
      rep_max: r.repMax,
      rest_seconds: r.restSeconds,
      target_duration_seconds: r.targetDurationSeconds ?? 0,
      target_distance_meters: r.targetDistanceMeters ?? 0,
    }),
    toLocal: (r) =>
      ({
        ...localBase(r),
        routineId: r.routine_id,
        exerciseId: r.exercise_id,
        position: r.position,
        targetSets: r.target_sets,
        repMin: r.rep_min,
        repMax: r.rep_max,
        restSeconds: r.rest_seconds ?? defaultSettings.restSeconds,
        targetDurationSeconds: Number(r.target_duration_seconds ?? 0),
        targetDistanceMeters: Number(r.target_distance_meters ?? 0),
      }) as RoutineExercise,
  },
  {
    local: 'workouts',
    remote: 'workouts',
    onConflict: 'user_id,id',
    toRemote: (r: Workout) => ({
      ...base(r),
      name: r.name,
      routine_id: r.routineId,
      started_at: r.startedAt,
      last_activity_at: r.lastActivityAt,
      paused_at: r.pausedAt,
      paused_duration_ms: r.pausedDurationMs,
      completed_at: r.completedAt,
      notes: r.notes,
    }),
    toLocal: (r) =>
      ({
        ...localBase(r),
        name: r.name,
        routineId: (r.routine_id as string | null) ?? null,
        startedAt: iso(r.started_at)!,
        lastActivityAt:
          iso(r.last_activity_at) ??
          iso(r.completed_at) ??
          iso(r.updated_at) ??
          iso(r.started_at)!,
        pausedAt: iso(r.paused_at),
        pausedDurationMs: Math.max(0, Number(r.paused_duration_ms ?? 0)),
        completedAt: iso(r.completed_at),
        notes: r.notes ?? '',
      }) as Workout,
  },
  {
    local: 'workoutExercises',
    remote: 'workout_exercises',
    onConflict: 'user_id,id',
    toRemote: (r: WorkoutExercise) => ({
      ...base(r),
      workout_id: r.workoutId,
      exercise_id: r.exerciseId,
      position: r.position,
      notes: r.notes,
      rest_seconds: r.restSeconds,
      target_duration_seconds: r.targetDurationSeconds ?? 0,
      target_distance_meters: r.targetDistanceMeters ?? 0,
    }),
    toLocal: (r) =>
      ({
        ...localBase(r),
        workoutId: r.workout_id,
        exerciseId: r.exercise_id,
        position: r.position,
        notes: r.notes ?? '',
        restSeconds: r.rest_seconds ?? defaultSettings.restSeconds,
        targetDurationSeconds: Number(r.target_duration_seconds ?? 0),
        targetDistanceMeters: Number(r.target_distance_meters ?? 0),
      }) as WorkoutExercise,
  },
  {
    local: 'sets',
    remote: 'sets',
    onConflict: 'user_id,id',
    toRemote: (r: SetEntry) => ({
      ...base(r),
      workout_id: r.workoutId,
      workout_exercise_id: r.workoutExerciseId,
      position: r.position,
      type: r.type,
      weight: r.weight,
      unit: r.unit,
      weight_kg: r.weightKg,
      reps: r.reps,
      done: Boolean(r.done),
    }),
    toLocal: (r) =>
      ({
        ...localBase(r),
        workoutId: r.workout_id,
        workoutExerciseId: r.workout_exercise_id,
        position: r.position,
        type: r.type,
        weight: Number(r.weight),
        unit: r.unit,
        weightKg: Number(r.weight_kg),
        reps: r.reps,
        done: r.done ? 1 : 0,
      }) as SetEntry,
  },
  {
    local: 'cardioEntries',
    remote: 'cardio_entries',
    onConflict: 'user_id,id',
    toRemote: (r: CardioEntry) => ({
      ...base(r),
      workout_id: r.workoutId,
      workout_exercise_id: r.workoutExerciseId,
      started_at: r.startedAt,
      ended_at: r.endedAt,
      paused_at: r.pausedAt,
      paused_duration_ms: r.pausedDurationMs,
      duration_seconds: r.durationSeconds,
      distance_meters: r.distanceMeters,
      calories: r.calories,
      incline: r.incline,
      resistance: r.resistance,
      done: Boolean(r.done),
    }),
    toLocal: (r) =>
      ({
        ...localBase(r),
        workoutId: r.workout_id,
        workoutExerciseId: r.workout_exercise_id,
        startedAt: iso(r.started_at)!,
        endedAt: iso(r.ended_at),
        pausedAt: iso(r.paused_at),
        pausedDurationMs: Number(r.paused_duration_ms ?? 0),
        durationSeconds: Number(r.duration_seconds ?? 0),
        distanceMeters: Number(r.distance_meters ?? 0),
        calories: Number(r.calories ?? 0),
        incline: Number(r.incline ?? 0),
        resistance: Number(r.resistance ?? 0),
        done: r.done ? 1 : 0,
      }) as CardioEntry,
  },
  {
    local: 'bodyWeight',
    remote: 'body_weight',
    onConflict: 'user_id,id',
    toRemote: (r: BodyWeight) => ({
      ...base(r),
      measured_at: r.measuredAt,
      weight: r.weight,
      unit: r.unit,
      weight_kg: r.weightKg,
    }),
    toLocal: (r) =>
      ({
        ...localBase(r),
        measuredAt: iso(r.measured_at)!,
        weight: Number(r.weight),
        unit: r.unit,
        weightKg: Number(r.weight_kg),
      }) as BodyWeight,
  },
  {
    // Single per-user preferences row: local id 'app' ↔ remote pk (user_id).
    local: 'settings',
    remote: 'user_settings',
    onConflict: 'user_id',
    remoteCursorColumn: 'user_id',
    toRemote: (r: Settings) => ({
      theme: r.theme ?? defaultSettings.theme,
      unit: r.unit,
      rest_seconds: r.restSeconds,
      daily_weight_reminder:
        r.dailyWeightReminder ?? defaultSettings.dailyWeightReminder,
      increment_kg: r.incrementKg,
      increment_lb: r.incrementLb,
      updated_at: r.updatedAt || new Date().toISOString(),
    }),
    toLocal: (r) => ({
      id: 'app',
      theme: isThemePreference(r.theme) ? r.theme : defaultSettings.theme,
      unit: r.unit,
      restSeconds: r.rest_seconds,
      dailyWeightReminder:
        typeof r.daily_weight_reminder === 'boolean'
          ? r.daily_weight_reminder
          : defaultSettings.dailyWeightReminder,
      incrementKg: Number(r.increment_kg),
      incrementLb: Number(r.increment_lb),
      updatedAt: iso(r.updated_at)!,
    }),
  },
]

export const localTable = (name: string) => db.table(name)
