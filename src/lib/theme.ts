import type { ThemePreference } from '../db/types'

export const THEME_STORAGE_KEY = 'gymtrack:theme'

export const themePreferences: ThemePreference[] = [
  'system',
  'light',
  'dark',
]

export function isThemePreference(value: unknown): value is ThemePreference {
  return themePreferences.includes(value as ThemePreference)
}

function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

function resolvedTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark'
}

function renderTheme(preference: ThemePreference): void {
  const resolved = resolvedTheme(preference)
  document.documentElement.dataset.theme = resolved
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'light' ? '#eeede8' : '#0b0d0e')
}

export function applyThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // IndexedDB remains authoritative if browser storage is restricted.
  }
  renderTheme(preference)
}

export function initializeThemePreference(): void {
  renderTheme(readStoredTheme())
  window
    .matchMedia('(prefers-color-scheme: light)')
    .addEventListener('change', () => {
      const preference = readStoredTheme()
      if (preference === 'system') renderTheme(preference)
    })
}
