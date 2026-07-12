import type { FilterState, SortState, Updater } from "./types";

/** Resolve a React-style updater (value or `(prev) => next`) against `prev`. */
export function applyUpdater<T>(updater: Updater<T>, prev: T): T {
  return typeof updater === "function"
    ? (updater as (p: T) => T)(prev)
    : updater;
}

/** Default row-id extractor: uses a stable `id` field if present, else the index. */
export function defaultGetRowId<TRow>(row: TRow, index: number): string {
  if (row && typeof row === "object" && "id" in row) {
    return String((row as { id: unknown }).id);
  }
  return String(index);
}

/**
 * Cycle a column's sort: unsorted → asc → desc → unsorted.
 * `multi` keeps the other columns' sorts; otherwise it becomes the only sort.
 */
export function cycleSort(
  prev: SortState[],
  columnId: string,
  multi: boolean,
): SortState[] {
  const existing = prev.find((s) => s.id === columnId);
  const others = multi ? prev.filter((s) => s.id !== columnId) : [];
  if (!existing) return [...others, { id: columnId, desc: false }];
  if (!existing.desc) return [...others, { id: columnId, desc: true }];
  return others; // was desc → remove
}

/** Set (or, when `value === undefined`, remove) a single column filter. */
export function upsertFilter(
  prev: FilterState[],
  columnId: string,
  value: unknown,
): FilterState[] {
  const others = prev.filter((f) => f.id !== columnId);
  if (value === undefined) return others;
  return [...others, { id: columnId, value }];
}

/** Select or deselect one row id, returning `prev` unchanged when it is a no-op. */
export function setRowSelected(
  prev: Record<string, boolean>,
  id: string,
  value: boolean,
): Record<string, boolean> {
  if (value) {
    if (prev[id] === true) return prev;
    return { ...prev, [id]: true };
  }
  if (!(id in prev)) return prev;
  const { [id]: _removed, ...rest } = prev;
  return rest;
}

/** Select or deselect many row ids at once, returning `prev` unchanged on no-op. */
export function setRowsSelected(
  prev: Record<string, boolean>,
  ids: string[],
  value: boolean,
): Record<string, boolean> {
  const next = { ...prev };
  let changed = false;
  for (const id of ids) {
    if (value) {
      if (next[id] !== true) {
        next[id] = true;
        changed = true;
      }
    } else if (id in next) {
      delete next[id];
      changed = true;
    }
  }
  return changed ? next : prev;
}
