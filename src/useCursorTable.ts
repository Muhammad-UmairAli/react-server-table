import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CursorFetchData,
  FilterState,
  SortDirection,
  SortState,
  Updater,
} from "./types";
import {
  applyUpdater,
  cycleSort,
  defaultGetRowId,
  setRowSelected,
  setRowsSelected,
  upsertFilter,
} from "./utils";

const DEFAULT_LIMIT = 10;

/** One fetched cursor page. */
interface CursorPage<TRow> {
  rows: TRow[];
  nextCursor: string | null;
}

/** Options for {@link useCursorTable}. */
export interface UseCursorTableOptions<TRow> {
  /** Your cursor fetcher. `cursor` is `null` for the first page. */
  fetchData: CursorFetchData<TRow>;
  /** Extract a stable id for a row (keyed selection). Defaults to `row.id` ?? index. */
  getRowId?: (row: TRow, index: number) => string;
  /** Rows per page. Defaults to 10. Changing it resets to the first page. */
  limit?: number;
  /** Initial sorting / filters / selection. */
  initialState?: {
    sorting?: SortState[];
    filters?: FilterState[];
    selection?: Record<string, boolean>;
  };
}

/**
 * A headless cursor-paginated table. Supports two navigation styles over the
 * same loaded-page cache:
 * - **Paged:** `rows` (current page), `nextPage`/`previousPage`.
 * - **Infinite:** `allRows` (accumulated), `loadMore`.
 */
export interface CursorTableInstance<TRow> {
  // ── Paged view ────────────────────────────────────────────────────────────
  /** Rows for the current page. */
  rows: TRow[];
  /** Current page, zero-based (index into the loaded pages). */
  pageIndex: number;
  /** Advance one page (fetching it if not already loaded). */
  nextPage: () => void;
  /** Go back one page (always already loaded — no fetch). */
  previousPage: () => void;
  canPreviousPage: boolean;
  canNextPage: boolean;

  // ── Infinite view ─────────────────────────────────────────────────────────
  /** All rows loaded so far, in order (across every fetched page). */
  allRows: TRow[];
  /** Fetch and append the next page. No-op when there are no more. */
  loadMore: () => void;
  /** `true` when the last loaded page reported a next cursor. */
  hasMore: boolean;
  /** Clear all pages and refetch from the first page. */
  reset: () => void;

  // ── Status ────────────────────────────────────────────────────────────────
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  /** Alias of `reset` — refetch from the first page. */
  reload: () => void;

  // ── Sorting ───────────────────────────────────────────────────────────────
  sorting: SortState[];
  setSorting: (updater: Updater<SortState[]>) => void;
  toggleSort: (columnId: string, opts?: { multi?: boolean }) => void;
  getSort: (columnId: string) => SortDirection | false;

  // ── Filtering ─────────────────────────────────────────────────────────────
  filters: FilterState[];
  setFilter: (columnId: string, value: unknown) => void;
  setFilters: (updater: Updater<FilterState[]>) => void;
  clearFilters: () => void;
  getFilter: (columnId: string) => unknown;

  // ── Paging config ─────────────────────────────────────────────────────────
  limit: number;
  setLimit: (limit: number) => void;

  // ── Selection (over all loaded rows) ──────────────────────────────────────
  selection: Record<string, boolean>;
  isRowSelected: (row: TRow, index: number) => boolean;
  toggleRowSelected: (row: TRow, index: number, value?: boolean) => void;
  /** Toggle every currently-loaded row (across all pages). */
  toggleAllRowsSelected: (value?: boolean) => void;
  clearSelection: () => void;
  selectedRowIds: string[];
  selectedRows: TRow[];
  /** `true` when every loaded row is selected. */
  isAllRowsSelected: boolean;
  isSomeRowsSelected: boolean;
}

/** Headless hook that owns the state of a cursor-paginated data table. */
export function useCursorTable<TRow>(
  options: UseCursorTableOptions<TRow>,
): CursorTableInstance<TRow> {
  const { initialState } = options;

  const [pages, setPages] = useState<CursorPage<TRow>[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [sorting, setSortingState] = useState<SortState[]>(
    () => initialState?.sorting ?? [],
  );
  const [filters, setFiltersState] = useState<FilterState[]>(
    () => initialState?.filters ?? [],
  );
  const [selection, setSelection] = useState<Record<string, boolean>>(
    () => initialState?.selection ?? {},
  );
  const [limit, setLimitState] = useState(options.limit ?? DEFAULT_LIMIT);

  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  const fetchDataRef = useRef<CursorFetchData<TRow>>(options.fetchData);
  useEffect(() => {
    fetchDataRef.current = options.fetchData;
  });
  const getRowId = options.getRowId ?? defaultGetRowId<TRow>;

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Fetch one page. `reset` replaces the page list (back to page 0); `append`
   * adds a page. Returns whether this fetch's result was applied (i.e. not
   * superseded), so callers can decide whether to advance the page index.
   */
  const doFetch = useCallback(
    async (
      cursor: string | null,
      mode: "reset" | "append",
      sortingArg: SortState[],
      filtersArg: FilterState[],
    ): Promise<boolean> => {
      const requestId = ++requestIdRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsFetching(true);

      const superseded = () =>
        controller.signal.aborted || requestId !== requestIdRef.current;

      try {
        const result = await fetchDataRef.current(
          { cursor, limit, sorting: sortingArg, filters: filtersArg },
          { signal: controller.signal },
        );
        if (superseded()) return false;
        const page: CursorPage<TRow> = {
          rows: result.rows,
          nextCursor: result.nextCursor ?? null,
        };
        if (mode === "reset") {
          setPages([page]);
          setPageIndex(0);
        } else {
          setPages((prev) => [...prev, page]);
        }
        setError(null);
        return true;
      } catch (err: unknown) {
        if (superseded()) return false;
        setError(err instanceof Error ? err : new Error(String(err)));
        return false;
      } finally {
        if (!superseded()) {
          setIsFetching(false);
          setIsLoading(false);
        }
      }
    },
    [limit],
  );

  // Fetch the first page on mount, and reset whenever sorting/filters/limit
  // change or reload/reset is requested. `doFetch` changes identity only when
  // `limit` changes, which is exactly when we also want to reset.
  useEffect(() => {
    void doFetch(null, "reset", sorting, filters);
    return () => abortRef.current?.abort();
  }, [sorting, filters, reloadCount, doFetch]);

  const reset = useCallback(() => setReloadCount((c) => c + 1), []);

  // ── Paged navigation ──────────────────────────────────────────────────────
  const canPreviousPage = pageIndex > 0;
  const canNextPage =
    pageIndex < pages.length - 1 || pages[pageIndex]?.nextCursor != null;

  const nextPage = useCallback(() => {
    if (pageIndex < pages.length - 1) {
      setPageIndex(pageIndex + 1); // already loaded
      return;
    }
    const current = pages[pageIndex];
    if (!current || current.nextCursor == null || isFetching) return;
    void doFetch(current.nextCursor, "append", sorting, filters).then(
      (applied) => {
        if (applied) setPageIndex((idx) => idx + 1);
      },
    );
  }, [pages, pageIndex, isFetching, doFetch, sorting, filters]);

  const previousPage = useCallback(
    () => setPageIndex((idx) => Math.max(0, idx - 1)),
    [],
  );

  // ── Infinite navigation ───────────────────────────────────────────────────
  const hasMore =
    pages.length > 0 && pages[pages.length - 1].nextCursor != null;

  const loadMore = useCallback(() => {
    const last = pages[pages.length - 1];
    if (!last || last.nextCursor == null || isFetching) return;
    void doFetch(last.nextCursor, "append", sorting, filters);
  }, [pages, isFetching, doFetch, sorting, filters]);

  // ── Sorting ───────────────────────────────────────────────────────────────
  const setSorting = useCallback((updater: Updater<SortState[]>) => {
    setSortingState((prev) => applyUpdater(updater, prev));
  }, []);

  const toggleSort = useCallback(
    (columnId: string, opts?: { multi?: boolean }) => {
      setSortingState((prev) => cycleSort(prev, columnId, opts?.multi ?? false));
    },
    [],
  );

  const getSort = useCallback(
    (columnId: string): SortDirection | false => {
      const s = sorting.find((entry) => entry.id === columnId);
      if (!s) return false;
      return s.desc ? "desc" : "asc";
    },
    [sorting],
  );

  // ── Filtering ─────────────────────────────────────────────────────────────
  const setFilters = useCallback((updater: Updater<FilterState[]>) => {
    setFiltersState((prev) => applyUpdater(updater, prev));
  }, []);

  const setFilter = useCallback((columnId: string, value: unknown) => {
    setFiltersState((prev) => upsertFilter(prev, columnId, value));
  }, []);

  const clearFilters = useCallback(() => setFiltersState([]), []);

  const getFilter = useCallback(
    (columnId: string): unknown =>
      filters.find((f) => f.id === columnId)?.value,
    [filters],
  );

  const setLimit = useCallback((next: number) => setLimitState(next), []);

  // ── Views ─────────────────────────────────────────────────────────────────
  const rows = pages[pageIndex]?.rows ?? [];
  const allRows = useMemo(() => pages.flatMap((p) => p.rows), [pages]);

  // ── Selection (over all loaded rows) ──────────────────────────────────────
  const isRowSelected = useCallback(
    (row: TRow, index: number) => selection[getRowId(row, index)] === true,
    [selection, getRowId],
  );

  const toggleRowSelected = useCallback(
    (row: TRow, index: number, value?: boolean) => {
      const id = getRowId(row, index);
      setSelection((prev) => setRowSelected(prev, id, value ?? prev[id] !== true));
    },
    [getRowId],
  );

  const toggleAllRowsSelected = useCallback(
    (value?: boolean) => {
      const ids = allRows.map((row, i) => getRowId(row, i));
      setSelection((prev) => {
        const allSelected =
          ids.length > 0 && ids.every((id) => prev[id] === true);
        return setRowsSelected(prev, ids, value ?? !allSelected);
      });
    },
    [allRows, getRowId],
  );

  const clearSelection = useCallback(() => setSelection({}), []);

  const selectedRowIds = useMemo(
    () => Object.keys(selection).filter((id) => selection[id]),
    [selection],
  );

  const selectedRows = useMemo(
    () => allRows.filter((row, i) => selection[getRowId(row, i)] === true),
    [allRows, selection, getRowId],
  );

  const isAllRowsSelected = useMemo(
    () =>
      allRows.length > 0 &&
      allRows.every((row, i) => selection[getRowId(row, i)] === true),
    [allRows, selection, getRowId],
  );

  const isSomeRowsSelected = useMemo(
    () =>
      !isAllRowsSelected &&
      allRows.some((row, i) => selection[getRowId(row, i)] === true),
    [allRows, selection, getRowId, isAllRowsSelected],
  );

  return {
    rows,
    pageIndex,
    nextPage,
    previousPage,
    canPreviousPage,
    canNextPage,

    allRows,
    loadMore,
    hasMore,
    reset,

    isLoading,
    isFetching,
    error,
    reload: reset,

    sorting,
    setSorting,
    toggleSort,
    getSort,

    filters,
    setFilter,
    setFilters,
    clearFilters,
    getFilter,

    limit,
    setLimit,

    selection,
    isRowSelected,
    toggleRowSelected,
    toggleAllRowsSelected,
    clearSelection,
    selectedRowIds,
    selectedRows,
    isAllRowsSelected,
    isSomeRowsSelected,
  };
}
