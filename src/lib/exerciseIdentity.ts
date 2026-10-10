import type { Exercise } from '../db/types'

const nameAliases: Record<string, string> = {
  'squat barbell': 'Back Squat',
  'bench press barbell': 'Barbell Bench Press',
  'bench press': 'Barbell Bench Press',
  'bench press dumbbell': 'Dumbbell Bench Press',
  'incline bench press barbell': 'Incline Barbell Bench Press',
  'incline bench press dumbbell': 'Incline Dumbbell Press',
  'incline bench press smith machine': 'Smith Machine Incline Press',
  'incline chest press machine': 'Incline Machine Chest Press',
  'deadlift barbell': 'Deadlift',
  'romanian deadlift barbell': 'Romanian Deadlift',
  'sumo deadlift barbell': 'Sumo Deadlift',
  'overhead press barbell': 'Overhead Press',
  'strict military press barbell': 'Overhead Press',
  'shoulder press dumbbell': 'Seated Dumbbell Press',
  'seated row cable': 'Seated Cable Row',
  'seated row machine': 'Seated Machine Row',
  'seated widegrip row cable': 'Seated Wide-Grip Cable Row',
  'seated row': 'Seated Cable Row',
  'bent over row barbell': 'Barbell Row',
  'bent over row dumbbell': 'Dumbbell Row',
  'row dumbbell': 'Dumbbell Row',
  't bar row': 'T-Bar Row',
  'bicep curl barbell': 'Barbell Curl',
  'bicep curl dumbbell': 'Dumbbell Curl',
  'bicep curl cable': 'Cable Curl',
  'hammer curl dumbbell': 'Hammer Curl',
  'preacher curl barbell': 'Preacher Curl',
  'tricep pushdown cable': 'Triceps Pushdown',
  'tricep pushdown': 'Triceps Pushdown',
  'triceps pushdown cable': 'Triceps Pushdown',
  'triceps pushdown cable straight bar': 'Triceps Pushdown',
  'tricep extension': 'Triceps Extension',
  'triceps extension': 'Triceps Extension',
  'triceps extension cable': 'Cable Triceps Extension',
  'skullcrusher barbell': 'Skullcrusher',
  'pull up': 'Pull-Up',
  'pull up assisted': 'Pull-Up',
  'chin up': 'Chin-Up',
  'push up': 'Push-Up',
  'lat pulldown machine': 'Machine Lat Pulldown',
  'lat pulldown cable': 'Cable Lat Pulldown',
  'lateral raise dumbbell': 'Lateral Raise',
  'lateral raise cable': 'Cable Lateral Raise',
  'front raise dumbbell': 'Front Raise',
  'face pull cable': 'Face Pull',
  'chest fly dumbbell': 'Dumbbell Fly',
  'chest fly machine': 'Machine Chest Fly',
  'chest fly': 'Pec Deck',
  'cable crossover': 'Cable Fly',
  'cable fly crossover': 'Cable Fly',
  'leg extension machine': 'Leg Extension',
  'lying leg curl machine': 'Lying Leg Curl',
  'seated leg curl machine': 'Seated Leg Curl',
  'hip thrust barbell': 'Hip Thrust',
  'glute bridge barbell': 'Glute Bridge',
  'standing calf raise machine': 'Standing Calf Raise',
  'seated calf raise machine': 'Seated Calf Raise',
  'seated calf raise plate loaded': 'Seated Calf Raise',
  'calf press on seated leg press': 'Leg Press Calf Raise',
  'standing single leg press': 'Single-Leg Leg Press',
  'shrug barbell': 'Barbell Shrug',
  'front squat barbell': 'Front Squat',
  'goblet squat dumbbell': 'Goblet Squat',
  'goblet squat kettlebell': 'Goblet Squat',
  'bulgarian split squat dumbbell': 'Bulgarian Split Squat',
  'lunge dumbbell': 'Walking Lunge',
  'walking lunge dumbbell': 'Walking Lunge',
  'ab wheel': 'Ab Wheel Rollout',
  'cross body crunch': 'Cross-Body Crunch',
  'sit up': 'Sit-Up',
  dip: 'Dip',
  'chest dip': 'Dip',
  'chest dip assisted': 'Dip',
  'triceps dip': 'Dip',
  'triceps dip assisted': 'Dip',
  'tricep dip': 'Dip',
  'reverse fly': 'Rear Delt Fly',
  'reverse fly machine': 'Machine Reverse Fly',
  'back extension machine': 'Machine Back Extension',
  'hip abductor': 'Hip Abduction',
  'hip abductor machine': 'Hip Abduction',
  'hip adductor': 'Hip Adduction',
  'hip adductor machine': 'Hip Adduction',
  'farmers walk': "Farmer's Carry",
  'farmers carry': "Farmer's Carry",
}

const equipmentMarkers = [
  ['smith-machine', 'Smith Machine'],
  ['plate-loaded', 'Plate Loaded'],
  ['kettlebell', 'Kettlebell'],
  ['dumbbell', 'Dumbbell'],
  ['barbell', 'Barbell'],
  ['machine', 'Machine'],
  ['cable', 'Cable'],
  ['assisted', 'Assisted'],
  ['band', 'Band'],
] as const

const legacyIdAliases: Record<string, string> = {
  'strong-calf-press-on-seated-leg-press': 'builtin-leg-press-calf-raise',
  'strong-incline-bench-press-smith-machine':
    'builtin-smith-machine-incline-press',
  'strong-standing-single-leg-press': 'builtin-single-leg-leg-press',
}

export const normalizeExerciseName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** "Bench Press (Barbell)" → equipment-aware matching candidates. */
function candidates(name: string): string[] {
  const match = name.match(/^(.*?)\s*\((.*?)\)\s*$/)
  const base = normalizeExerciseName(match ? match[1] : name)
  const equipment = match ? normalizeExerciseName(match[2]) : ''
  const values = [normalizeExerciseName(name)]
  if (equipment) {
    values.push(`${base} ${equipment}`, `${equipment} ${base}`)
  }
  values.push(base)
  return [...new Set(values)]
}

/** Match an imported name to the canonical exercise row used by the app. */
export function matchExercise(
  importedName: string,
  existing: Pick<Exercise, 'id' | 'name'>[],
): string | null {
  const byName = new Map(
    existing.map((exercise) => [
      normalizeExerciseName(exercise.name),
      exercise.id,
    ]),
  )
  for (const candidate of candidates(importedName)) {
    const direct = byName.get(candidate)
    if (direct) return direct
    const alias = nameAliases[candidate]
    if (!alias) continue
    const viaAlias = byName.get(normalizeExerciseName(alias))
    if (viaAlias) return viaAlias
  }
  return null
}

/**
 * Resolve only at import or migration boundaries. UI components consume the
 * canonical stored id directly and never guess content from display text.
 */
export function matchLegacyExercise(
  exercise: Pick<Exercise, 'id' | 'name'>,
  builtins: Pick<Exercise, 'id' | 'name'>[],
): string | null {
  const explicit = legacyIdAliases[exercise.id]
  if (explicit && builtins.some((item) => item.id === explicit)) return explicit

  if (exercise.id.startsWith('strong-')) {
    const slug = exercise.id.slice('strong-'.length)
    for (const [marker, label] of equipmentMarkers) {
      const markerAt = slug.indexOf(`-${marker}`)
      if (markerAt <= 0) continue
      const base = slug.slice(0, markerAt).replaceAll('-', ' ')
      const matched = matchExercise(`${base} (${label})`, builtins)
      if (matched) return matched
    }
    const fromId = matchExercise(slug.replaceAll('-', ' '), builtins)
    if (fromId) return fromId
  }

  return matchExercise(exercise.name, builtins)
}
