import type { Updater } from "./types";

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
