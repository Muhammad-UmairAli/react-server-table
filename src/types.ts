/**
 * Public types for react-server-table.
 *
 * The library is headless: it owns the *state* of a server-driven table
 * (pagination, sorting, filtering, selection) and hands it back to you.
 * You own the markup and the data fetching.
 */

/** A column sort direction. `false` means "not sorted by this column". */
export type SortDirection = "asc" | "desc";

/** One column's sort state. `desc: false` means ascending. */
export interface SortState {
  /** Column identifier the consumer chooses (usually the field name). */
  id: string;
  /** `true` = descending, `false` = ascending. */
  desc: boolean;
}

/** One column's filter state. `value` is opaque to the library. */
export interface FilterState {
  /** Column identifier the consumer chooses. */
  id: string;
  /** Filter value — shape is entirely up to the consumer/server. */
  value: unknown;
}

/** Zero-based pagination state. */
export interface PaginationState {
  /** Current page, zero-based. */
  pageIndex: number;
  /** Number of rows per page. */
  pageSize: number;
}

/**
 * The full set of parameters handed to your {@link FetchData} function
 * whenever pagination, sorting, or filtering changes.
 */
export interface ServerTableParams {
  pagination: PaginationState;
  sorting: SortState[];
  filters: FilterState[];
}

/** What your fetcher must resolve with. */
export interface FetchDataResult<TRow> {
  /** The rows for the requested page. */
  rows: TRow[];
  /** Total number of rows across all pages (used to compute page count). */
  total: number;
}

/**
 * The data-fetching contract. The library never fetches on its own terms —
 * you provide this function and wire it to React Query, SWR, or raw `fetch`.
 *
 * @param params  Current pagination / sorting / filtering state.
 * @param context `signal` is aborted when a newer request supersedes this one
 *                or the component unmounts; forward it to `fetch` to cancel.
 */
export type FetchData<TRow> = (
  params: ServerTableParams,
  context: { signal: AbortSignal },
) => Promise<FetchDataResult<TRow>>;

/** The mutable state the table owns. */
export interface ServerTableState {
  pagination: PaginationState;
  sorting: SortState[];
  filters: FilterState[];
  /** Map of rowId → selected. Absent keys are unselected. */
  selection: Record<string, boolean>;
}

/** A value or a functional updater `(prev) => next`, mirroring React setState. */
export type Updater<T> = T | ((prev: T) => T);

// ── Cursor pagination ───────────────────────────────────────────────────────

/**
 * Parameters handed to a cursor fetcher. `cursor` is `null` for the first page;
 * for later pages it is the `nextCursor` your fetcher previously returned.
 */
export interface CursorTableParams {
  /** Opaque cursor for the page to fetch, or `null` for the first page. */
  cursor: string | null;
  /** Maximum rows to return for this page. */
  limit: number;
  sorting: SortState[];
  filters: FilterState[];
}

/** What a cursor fetcher must resolve with. */
export interface CursorFetchResult<TRow> {
  /** The rows for the requested page. */
  rows: TRow[];
  /** Cursor for the following page, or `null`/`undefined` when there are no more. */
  nextCursor?: string | null;
}

/**
 * The cursor data-fetching contract. `cursor` is `null` on the first page.
 * Return the page's rows plus the `nextCursor` to advance (omit or `null` at the end).
 */
export type CursorFetchData<TRow> = (
  params: CursorTableParams,
  context: { signal: AbortSignal },
) => Promise<CursorFetchResult<TRow>>;
