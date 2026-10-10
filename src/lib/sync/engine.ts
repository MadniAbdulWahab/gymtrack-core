import { liveQuery } from 'dexie'
import { useSyncExternalStore } from 'react'
import { db } from '../../db/db'
import { supabase } from '../supabase'
import {
  ensureLocalOwner,
  keepLocalDataForUser,
  resetLocalDataForUser,
  type OwnershipCheck,
} from './accountOwnership'
import { tableMappings, type RemoteRow, type TableMapping } from './mappings'

const PAGE = 500
const EPOCH = '1970-01-01T00:00:00.000Z'

export interface SyncCursor {
  updatedAt: string
  id: string
}

// ---------- status store ----------

export type SyncPhase =
  | 'disabled'
  | 'signedOut'
  | 'idle'
  | 'syncing'
  | 'error'
  | 'accountConflict'

export type AccountConflict = Extract<
  OwnershipCheck,
  'differentAccount' | 'unclaimedLocalData' | 'unclaimedSyncedData'
>

export interface SyncStatus {
  phase: SyncPhase
  lastSyncedAt: string | null
  error: string | null
  accountConflict: AccountConflict | null
}

let status: SyncStatus = {
  phase: supabase ? 'signedOut' : 'disabled',
  lastSyncedAt: null,
  error: null,
  accountConflict: null,
}
const listeners = new Set<() => void>()

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((fn) => fn())
}

export const useSyncStatus = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => status,
  )

// ---------- cursors ----------

async function getCursor(table: string) {
  const stored = await db.syncState.get(table)
  return {
    table,
    pullCursor: stored?.pullCursor ?? EPOCH,
    pullCursorId: stored?.pullCursorId ?? '',
    pushCursor: stored?.pushCursor ?? EPOCH,
    pushCursorId: stored?.pushCursorId ?? '',
  }
}

// ---------- push (rows whose updatedAt advanced past the push cursor) ----------

function isAfterCursor(
  row: { id: string; updatedAt: string },
  cursor: SyncCursor,
) {
  return (
    row.updatedAt > cursor.updatedAt ||
    (row.updatedAt === cursor.updatedAt && row.id > cursor.id)
  )
}

function compareRows(
  a: { id: string; updatedAt: string },
  b: { id: string; updatedAt: string },
) {
  return a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id)
}

export async function rowsToPush(mapping: TableMapping, cursor: SyncCursor) {
  const rows = (await db.table(mapping.local).toArray()) as {
    id: string
    updatedAt: string
  }[]
  return rows
    .filter((row) => isAfterCursor(row, cursor))
    .sort(compareRows)
}

type UploadRows = (
  mapping: TableMapping,
  rows: { id: string; updatedAt: string }[],
) => Promise<void>

/** Push pages with a checkpoint after every successful idempotent upsert. */
export async function pushTablePages(
  mapping: TableMapping,
  uploadRows: UploadRows,
): Promise<void> {
  const state = await getCursor(mapping.local)
  const rows = await rowsToPush(mapping, {
    updatedAt: state.pushCursor,
    id: state.pushCursorId,
  })
  if (!rows.length) return

  for (let i = 0; i < rows.length; i += PAGE) {
    const chunk = rows.slice(i, i + PAGE)
    await uploadRows(mapping, chunk)
    const newest = chunk[chunk.length - 1]
    await db.syncState.put({
      ...state,
      table: mapping.local,
      pushCursor: newest.updatedAt,
      pushCursorId: newest.id,
    })
    state.pushCursor = newest.updatedAt
    state.pushCursorId = newest.id
  }
}

async function pushTable(mapping: TableMapping): Promise<void> {
  if (!supabase) return
  const client = supabase
  await pushTablePages(mapping, async (currentMapping, chunk) => {
    const { error } = await client
      .from(currentMapping.remote)
      .upsert(chunk.map((row) => currentMapping.toRemote(row as never)) as never[], {
        onConflict: currentMapping.onConflict,
      })
    if (error) throw new Error(`${currentMapping.remote}: ${error.message}`)
  })
}

// ---------- pull (remote updated_at cursor; LWW apply per row) ----------

/** Apply remote rows locally, keeping whichever side is newer. */
export async function applyRemoteRows(mapping: TableMapping, rows: RemoteRow[]) {
  const table = db.table(mapping.local)
  await db.transaction('rw', table, async () => {
    for (const remote of rows) {
      const incoming = mapping.toLocal(remote)
      const existing = (await table.get(incoming.id)) as
        | { updatedAt: string }
        | undefined
      if (existing && existing.updatedAt >= incoming.updatedAt) continue
      await table.put(incoming)
    }
  })
}

type FetchRemotePage = (
  mapping: TableMapping,
  cursor: SyncCursor,
) => Promise<RemoteRow[]>

function remoteCursor(mapping: TableMapping, row: RemoteRow): SyncCursor {
  const cursorColumn = mapping.remoteCursorColumn ?? 'id'
  return {
    updatedAt: new Date(row.updated_at as string).toISOString(),
    id: String(row[cursorColumn]),
  }
}

/**
 * Apply keyset-paginated remote pages. Exported so the >500-row restore path
 * can be verified without a live Supabase project.
 */
export async function pullTablePages(
  mapping: TableMapping,
  fetchPage: FetchRemotePage,
): Promise<void> {
  for (;;) {
    const state = await getCursor(mapping.local)
    const data = await fetchPage(mapping, {
      updatedAt: state.pullCursor,
      id: state.pullCursorId,
    })
    if (!data.length) return

    await applyRemoteRows(mapping, data)
    const newest = remoteCursor(mapping, data[data.length - 1])
    await db.syncState.put({
      ...state,
      table: mapping.local,
      pullCursor: newest.updatedAt,
      pullCursorId: newest.id,
    })
  }
}

async function fetchRemotePage(
  mapping: TableMapping,
  cursor: SyncCursor,
): Promise<RemoteRow[]> {
  if (!supabase) return []
  const cursorColumn = mapping.remoteCursorColumn ?? 'id'

  // Finish every row tied at the current timestamp before moving forward.
  // Legacy timestamp-only cursors use an empty id and safely replay that tie.
  if (cursor.updatedAt !== EPOCH || cursor.id) {
    let tiedQuery = supabase
      .from(mapping.remote)
      .select('*')
      .eq('updated_at', cursor.updatedAt)
      .order(cursorColumn, { ascending: true })
      .limit(PAGE)
    if (cursor.id) tiedQuery = tiedQuery.gt(cursorColumn, cursor.id)
    const { data, error } = await tiedQuery
    if (error) throw new Error(`${mapping.remote}: ${error.message}`)
    if (data?.length) return data
  }

  const { data, error } = await supabase
    .from(mapping.remote)
    .select('*')
    .gt('updated_at', cursor.updatedAt)
    .order('updated_at', { ascending: true })
    .order(cursorColumn, { ascending: true })
    .limit(PAGE)
  if (error) throw new Error(`${mapping.remote}: ${error.message}`)
  return data ?? []
}

async function pullTable(mapping: TableMapping): Promise<void> {
  if (!supabase) return
  await pullTablePages(mapping, fetchRemotePage)
}

// ---------- orchestration ----------

let syncing = false
let queued = false

/**
 * Full cycle: pull first (so LWW resolves against the freshest remote),
 * then push local changes. Safe to call from anywhere; concurrent calls
 * coalesce into one queued follow-up run.
 */
export async function syncNow(): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    setStatus({ phase: 'signedOut', accountConflict: null })
    return
  }
  const ownership = await ensureLocalOwner(data.session.user.id)
  if (
    ownership === 'differentAccount' ||
    ownership === 'unclaimedLocalData' ||
    ownership === 'unclaimedSyncedData'
  ) {
    setStatus({ phase: 'accountConflict', accountConflict: ownership, error: null })
    return
  }
  if (syncing) {
    queued = true
    return
  }
  syncing = true
  setStatus({ phase: 'syncing', error: null, accountConflict: null })
  try {
    for (const mapping of tableMappings) await pullTable(mapping)
    for (const mapping of tableMappings) await pushTable(mapping)
    setStatus({
      phase: 'idle',
      lastSyncedAt: new Date().toISOString(),
      error: null,
      accountConflict: null,
    })
  } catch (err) {
    setStatus({ phase: 'error', error: err instanceof Error ? err.message : String(err) })
  } finally {
    syncing = false
    if (queued) {
      queued = false
      void syncNow()
    }
  }
}

/** Resolve the account guard only after an explicit user choice in Profile. */
export async function resolveAccountConflict(
  userId: string,
  resolution: 'keepLocal' | 'replaceLocal',
): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  if (data.session?.user.id !== userId) throw new Error('The signed-in account changed.')

  if (resolution === 'keepLocal') await keepLocalDataForUser(userId)
  else await resetLocalDataForUser(userId)

  setStatus({ phase: 'idle', error: null, accountConflict: null })
  await syncNow()
}

/** Count of local rows not yet confirmed pushed (for the "waiting" badge). */
export async function pendingPushCount(): Promise<number> {
  let count = 0
  for (const mapping of tableMappings) {
    const state = await getCursor(mapping.local)
    count += (
      await rowsToPush(mapping, {
        updatedAt: state.pushCursor,
        id: state.pushCursorId,
      })
    ).length
  }
  return count
}

/** Wire up sync triggers: launch, sign-in, reconnect, foreground, local edits. */
export function startSyncEngine() {
  if (!supabase) return

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
      void syncNow()
    }
    if (event === 'SIGNED_OUT') {
      setStatus({ phase: 'signedOut', accountConflict: null, error: null })
    }
  })

  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })

  // Debounced push after local edits (any tracked table changing bumps this).
  let debounce: ReturnType<typeof setTimeout> | undefined
  liveQuery(async () => {
    let newest = ''
    for (const mapping of tableMappings) {
      const rows = (await db.table(mapping.local).toArray()) as {
        updatedAt: string
      }[]
      for (const r of rows) if (r.updatedAt > newest) newest = r.updatedAt
    }
    return newest
  }).subscribe({
    next: () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => void syncNow(), 4000)
    },
    error: () => {},
  })
}
