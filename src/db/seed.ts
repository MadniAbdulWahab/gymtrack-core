import type {
  Exercise,
  MuscleGroup,
  Routine,
  RoutineExercise,
} from './types'

type SeedEntry = [
  name: string,
  primary: MuscleGroup,
  secondary?: MuscleGroup[],
  trackingType?: Exercise['trackingType'],
]

// Built-in library. Names must stay stable: the Strong CSV importer (phase 6)
// matches on them, and seeded IDs are derived from the name.
const entries: SeedEntry[] = [
  // Chest
  ['Barbell Bench Press', 'chest', ['triceps', 'shoulders']],
  ['Incline Barbell Bench Press', 'chest', ['triceps', 'shoulders']],
  ['Dumbbell Bench Press', 'chest', ['triceps', 'shoulders']],
  ['Incline Dumbbell Press', 'chest', ['triceps', 'shoulders']],
  ['Machine Chest Press', 'chest', ['triceps']],
  ['Machine Chest Fly', 'chest', ['shoulders']],
  ['Push-Up', 'chest', ['triceps', 'core']],
  ['Cable Fly', 'chest'],
  ['Dumbbell Fly', 'chest'],
  ['Chest Fly', 'chest'],
  ['Band Chest Press', 'chest', ['triceps', 'shoulders']],
  ['Pec Deck', 'chest'],
  ['Dip', 'chest', ['triceps', 'shoulders']],
  // Shoulders
  ['Overhead Press', 'shoulders', ['triceps', 'core']],
  ['Seated Dumbbell Press', 'shoulders', ['triceps']],
  ['Arnold Press', 'shoulders', ['triceps']],
  ['Machine Shoulder Press', 'shoulders', ['triceps']],
  ['Lateral Raise', 'shoulders'],
  ['Cable Lateral Raise', 'shoulders'],
  ['Front Raise', 'shoulders'],
  ['Cable Front Raise', 'shoulders'],
  ['Rear Delt Fly', 'shoulders', ['back']],
  ['Machine Reverse Fly', 'shoulders', ['back']],
  ['Face Pull', 'shoulders', ['back']],
  ['Upright Row', 'shoulders', ['biceps']],
  // Back
  ['Deadlift', 'back', ['hamstrings', 'glutes']],
  ['Sumo Deadlift', 'glutes', ['hamstrings', 'back']],
  ['Rack Pull', 'back', ['glutes', 'hamstrings']],
  ['Pull-Up', 'back', ['biceps']],
  ['Chin-Up', 'back', ['biceps']],
  ['Lat Pulldown', 'back', ['biceps']],
  ['Machine Lat Pulldown', 'back', ['biceps']],
  ['Cable Lat Pulldown', 'back', ['biceps']],
  ['Seated Cable Row', 'back', ['biceps']],
  ['Seated Wide-Grip Cable Row', 'back', ['biceps']],
  ['Seated Machine Row', 'back', ['biceps']],
  ['Barbell Row', 'back', ['biceps']],
  ['Dumbbell Row', 'back', ['biceps']],
  ['T-Bar Row', 'back', ['biceps']],
  ['Machine Row', 'back', ['biceps']],
  ['Straight-Arm Pulldown', 'back'],
  ['Barbell Shrug', 'back', ['forearms']],
  ['Good Morning', 'hamstrings', ['back', 'glutes']],
  // Biceps
  ['Barbell Curl', 'biceps', ['forearms']],
  ['EZ-Bar Curl', 'biceps', ['forearms']],
  ['Dumbbell Curl', 'biceps'],
  ['Hammer Curl', 'biceps', ['forearms']],
  ['Preacher Curl', 'biceps'],
  ['Dumbbell Preacher Curl', 'biceps'],
  ['Incline Dumbbell Curl', 'biceps'],
  ['Cable Curl', 'biceps'],
  ['Concentration Curl', 'biceps'],
  // Triceps
  ['Close-Grip Bench Press', 'triceps', ['chest', 'shoulders']],
  ['Skullcrusher', 'triceps'],
  ['Triceps Pushdown', 'triceps'],
  ['Overhead Triceps Extension', 'triceps'],
  ['Triceps Extension', 'triceps'],
  ['Cable Triceps Extension', 'triceps'],
  ['Cable Kickback', 'triceps'],
  // Legs
  ['Back Squat', 'quads', ['glutes', 'core']],
  ['Front Squat', 'quads', ['glutes', 'core']],
  ['Goblet Squat', 'quads', ['glutes', 'core']],
  ['Leg Press', 'quads', ['glutes']],
  ['Hack Squat', 'quads', ['glutes']],
  ['Bulgarian Split Squat', 'quads', ['glutes']],
  ['Walking Lunge', 'quads', ['glutes', 'core']],
  ['Leg Extension', 'quads'],
  ['Lying Leg Curl', 'hamstrings'],
  ['Seated Leg Curl', 'hamstrings'],
  ['Glute Ham Raise', 'hamstrings', ['glutes']],
  ['Romanian Deadlift', 'hamstrings', ['glutes', 'back']],
  ['Hip Thrust', 'glutes', ['hamstrings']],
  ['Glute Bridge', 'glutes', ['hamstrings']],
  ['Hip Abduction', 'glutes'],
  ['Hip Adduction', 'quads'],
  ['Standing Calf Raise', 'calves'],
  ['Seated Calf Raise', 'calves'],
  // Core
  ['Plank', 'core'],
  ['Side Plank', 'core'],
  ['Crunch', 'core'],
  ['Cable Crunch', 'core'],
  ['Hanging Leg Raise', 'core'],
  ['Russian Twist', 'core'],
  ['Ab Wheel Rollout', 'core', ['back']],
  // Forearms
  ['Wrist Curl', 'forearms'],
  ['Reverse Curl', 'forearms', ['biceps']],
  ["Farmer's Carry", 'forearms', ['core', 'back']],
  // --- library expansion (2026-07: machines, smith, variants) ---
  // Chest
  ['Incline Machine Chest Press', 'chest', ['triceps', 'shoulders']],
  ['Decline Bench Press', 'chest', ['triceps']],
  ['Decline Chest Fly', 'chest'],
  ['Smith Machine Bench Press', 'chest', ['triceps', 'shoulders']],
  ['Smith Machine Incline Press', 'chest', ['triceps', 'shoulders']],
  ['Landmine Press', 'chest', ['shoulders', 'triceps']],
  ['Weighted Push-Up', 'chest', ['triceps', 'core']],
  // Shoulders
  ['Machine Lateral Raise', 'shoulders'],
  ['Standing Dumbbell Press', 'shoulders', ['triceps', 'core']],
  ['Push Press', 'shoulders', ['triceps', 'quads']],
  ['Cable Rear Delt Fly', 'shoulders', ['back']],
  ['Dumbbell Shrug', 'back', ['forearms']],
  ['Smith Machine Shrug', 'back', ['forearms']],
  // Back
  ['Machine Pullover', 'back', ['chest']],
  ['Chest-Supported Row', 'back', ['biceps']],
  ['Pendlay Row', 'back', ['hamstrings', 'biceps']],
  ['Inverted Row', 'back', ['biceps', 'core']],
  ['Close-Grip Lat Pulldown', 'back', ['biceps']],
  ['Single-Arm Lat Pulldown', 'back', ['biceps']],
  ['Back Extension', 'back', ['glutes', 'hamstrings']],
  ['Machine Back Extension', 'back', ['glutes', 'hamstrings']],
  ['Trap Bar Deadlift', 'back', ['quads', 'glutes', 'hamstrings']],
  // Arms
  ['Machine Bicep Curl', 'biceps'],
  ['Machine Preacher Curl', 'biceps'],
  ['Spider Curl', 'biceps'],
  ['Zottman Curl', 'biceps', ['forearms']],
  ['Cable Hammer Curl', 'biceps', ['forearms']],
  ['Machine Triceps Extension', 'triceps'],
  ['Overhead Cable Triceps Extension', 'triceps'],
  ['Bench Dip', 'triceps', ['chest', 'shoulders']],
  ['Diamond Push-Up', 'triceps', ['chest', 'core']],
  ['Reverse Wrist Curl', 'forearms'],
  // Legs & glutes
  ['Smith Machine Squat', 'quads', ['glutes', 'core']],
  ['Machine Squat', 'quads', ['glutes']],
  ['Dumbbell Squat', 'quads', ['glutes', 'core']],
  ['Seated Leg Press', 'quads', ['glutes']],
  ['Single-Leg Leg Press', 'quads', ['glutes']],
  ['Step-Up', 'quads', ['glutes', 'core']],
  ['Reverse Lunge', 'quads', ['glutes', 'hamstrings']],
  ['Nordic Hamstring Curl', 'hamstrings'],
  ['Kettlebell Swing', 'glutes', ['hamstrings', 'back', 'core']],
  ['Cable Pull-Through', 'glutes', ['hamstrings']],
  ['Cable Glute Kickback', 'glutes', ['hamstrings']],
  ['Machine Hip Thrust', 'glutes', ['hamstrings']],
  ['Leg Press Calf Raise', 'calves'],
  ['Donkey Calf Raise', 'calves'],
  // Core
  ['Machine Crunch', 'core'],
  ['Sit-Up', 'core'],
  ['Decline Sit-Up', 'core'],
  ['Bicycle Crunch', 'core'],
  ['Cross-Body Crunch', 'core'],
  ["Captain's Chair Knee Raise", 'core'],
  ['Cable Twist', 'core'],
  ['Cable Side Bend', 'core'],
  ['Torso Rotation', 'core'],
  ['Dead Bug', 'core'],
  ['V-Up', 'core'],
  ['Weighted Plank', 'core'],
  // Cardio machines
  ['Treadmill', 'quads', ['glutes', 'calves', 'core'], 'cardio'],
  ['Stationary Bike', 'quads', ['glutes', 'calves'], 'cardio'],
  ['Elliptical', 'quads', ['glutes', 'hamstrings'], 'cardio'],
  ['Stair Climber', 'glutes', ['quads', 'calves'], 'cardio'],
  ['Rowing Machine', 'back', ['quads', 'biceps', 'core'], 'cardio'],
]

/** Stable ID so re-seeding or cross-device seeding never duplicates rows. */
export const builtinExerciseId = (name: string) =>
  `builtin-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

export function builtinExercises(now: string): Exercise[] {
  return entries.map(([name, primaryMuscle, secondaryMuscles = [], trackingType = 'strength']) => ({
    id: builtinExerciseId(name),
    name,
    primaryMuscle,
    secondaryMuscles,
    isCustom: 0,
    trackingType,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }))
}

interface StarterExercise {
  name: string
  sets: number
  repMin: number
  repMax: number
}

interface StarterTemplate {
  name: string
  exercises: StarterExercise[]
}

const starterRestSeconds = ({ repMin }: StarterExercise) =>
  repMin <= 6 ? 120 : repMin >= 10 ? 60 : 90

/**
 * Four canonical starter sessions for generally healthy adults.
 * They prioritize familiar multi-joint movements, balanced muscle coverage,
 * and mostly 2–3 working sets in approachable rep ranges.
 */
const starterTemplates: StarterTemplate[] = [
  {
    name: 'Upper Foundation',
    exercises: [
      { name: 'Barbell Bench Press', sets: 3, repMin: 6, repMax: 10 },
      { name: 'Seated Cable Row', sets: 3, repMin: 8, repMax: 12 },
      { name: 'Overhead Press', sets: 3, repMin: 6, repMax: 10 },
      { name: 'Lat Pulldown', sets: 3, repMin: 8, repMax: 12 },
      { name: 'Lateral Raise', sets: 2, repMin: 12, repMax: 15 },
    ],
  },
  {
    name: 'Legs & Core',
    exercises: [
      { name: 'Back Squat', sets: 3, repMin: 6, repMax: 10 },
      { name: 'Romanian Deadlift', sets: 3, repMin: 8, repMax: 12 },
      { name: 'Leg Press', sets: 3, repMin: 10, repMax: 15 },
      { name: 'Seated Leg Curl', sets: 2, repMin: 10, repMax: 15 },
      { name: 'Standing Calf Raise', sets: 3, repMin: 10, repMax: 15 },
      { name: 'Cable Crunch', sets: 2, repMin: 10, repMax: 15 },
    ],
  },
  {
    name: 'Chest & Triceps',
    exercises: [
      { name: 'Incline Dumbbell Press', sets: 3, repMin: 8, repMax: 12 },
      { name: 'Machine Chest Press', sets: 3, repMin: 8, repMax: 12 },
      { name: 'Cable Fly', sets: 2, repMin: 12, repMax: 15 },
      { name: 'Close-Grip Bench Press', sets: 3, repMin: 8, repMax: 12 },
      { name: 'Triceps Pushdown', sets: 3, repMin: 10, repMax: 15 },
      { name: 'Overhead Triceps Extension', sets: 2, repMin: 10, repMax: 15 },
    ],
  },
  {
    name: 'Back & Biceps',
    exercises: [
      { name: 'Lat Pulldown', sets: 3, repMin: 8, repMax: 12 },
      { name: 'Barbell Row', sets: 3, repMin: 6, repMax: 10 },
      { name: 'Dumbbell Row', sets: 3, repMin: 8, repMax: 12 },
      { name: 'Face Pull', sets: 2, repMin: 12, repMax: 15 },
      { name: 'Barbell Curl', sets: 3, repMin: 8, repMax: 12 },
      { name: 'Hammer Curl', sets: 2, repMin: 10, repMax: 15 },
    ],
  },
]

export const STARTER_ROUTINE_PREFIX = 'starter-'

export const isStarterRoutineId = (id: string) =>
  id.startsWith(STARTER_ROUTINE_PREFIX)

const starterId = (name: string) =>
  `${STARTER_ROUTINE_PREFIX}${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

export function starterRoutines(
  now: string,
  startPosition = 0,
): { routines: Routine[]; routineExercises: RoutineExercise[] } {
  const routines: Routine[] = []
  const routineExercises: RoutineExercise[] = []

  starterTemplates.forEach((template, routineIndex) => {
    const routineId = starterId(template.name)
    routines.push({
      id: routineId,
      name: template.name,
      position: startPosition + routineIndex,
      savedAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    template.exercises.forEach((exercise, exerciseIndex) => {
      routineExercises.push({
        id: `${routineId}-exercise-${exerciseIndex + 1}`,
        routineId,
        exerciseId: builtinExerciseId(exercise.name),
        position: exerciseIndex,
        targetSets: exercise.sets,
        repMin: exercise.repMin,
        repMax: exercise.repMax,
        restSeconds: starterRestSeconds(exercise),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
    })
  })

  return { routines, routineExercises }
}
