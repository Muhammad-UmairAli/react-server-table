import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FetchData,
  FilterState,
  PaginationState,
  ServerTableState,
  SortDirection,
  SortState,
  Updater,
} from "./types";
import { applyUpdater, defaultGetRowId } from "./utils";

const DEFAULT_PAGE_SIZE = 10;

/** Options for {@link useServerTable}. */
export interface UseServerTableOptions<TRow> {
  /** Your data-fetching function. Called whenever pagination/sorting/filters change. */
  fetchData: FetchData<TRow>;
  /**
   * Extract a stable id for a row. Selection is keyed by this value, so for
   * selection to survive pagination it must be stable across pages (e.g. a
   * primary key). Defaults to a row's `id` field, falling back to the index.
   */
  getRowId?: (row: TRow, index: number) => string;
  /** Initial pagination/sorting/filters/selection. */
  initialState?: Partial<ServerTableState>;
  /** Initial page size when `initialState.pagination` is not supplied. Defaults to 10. */
  pageSize?: number;
}

/** The headless table instance returned by {@link useServerTable}. */
export interface ServerTableInstance<TRow> {
  // ── Data ────────────────────────────────────────────────────────────────
  /** Rows for the current page, as returned by your fetcher. */
  rows: TRow[];
  /** Total row count across all pages, as reported by your fetcher. */
  total: number;
  /** Number of pages, derived from `total` and `pageSize`. */
  pageCount: number;
  /** `true` until the first fetch settles. */
  isLoading: boolean;
  /** `true` whenever a fetch is in flight (including background refetches). */
  isFetching: boolean;
  /** The error from the most recent failed fetch, else `null`. */
  error: Error | null;
  /** Re-run the fetcher with the current params. */
  reload: () => void;

  // ── Pagination ────────────────────────────────────────────────────────────
  pagination: PaginationState;
  setPageIndex: (updater: Updater<number>) => void;
  setPageSize: (size: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  canPreviousPage: boolean;
  canNextPage: boolean;

  // ── Sorting ────────────────────────────────────────────────────────────────
  sorting: SortState[];
  setSorting: (updater: Updater<SortState[]>) => void;
  /**
   * Cycle a column's sort: unsorted → asc → desc → unsorted.
   * @param multi keep other columns' sorts (multi-sort). Defaults to `false`.
   */
  toggleSort: (columnId: string, opts?: { multi?: boolean }) => void;
  /** Current sort direction for a column, or `false` if unsorted. */
  getSort: (columnId: string) => SortDirection | false;

  // ── Filtering ──────────────────────────────────────────────────────────────
  filters: FilterState[];
  /** Set (or, when `value === undefined`, remove) a single column filter. */
  setFilter: (columnId: string, value: unknown) => void;
  setFilters: (updater: Updater<FilterState[]>) => void;
  clearFilters: () => void;
  /** Current filter value for a column, or `undefined`. */
  getFilter: (columnId: string) => unknown;

  // ── Selection ──────────────────────────────────────────────────────────────
  /** Raw selection map (rowId → selected). */
  selection: Record<string, boolean>;
  isRowSelected: (row: TRow, index: number) => boolean;
  /** Toggle a row (or set it to `value`). */
  toggleRowSelected: (row: TRow, index: number, value?: boolean) => void;
  /** Toggle every row on the current page (or set them all to `value`). */
  toggleAllRowsSelected: (value?: boolean) => void;
  clearSelection: () => void;
  /** Ids of all selected rows, across every page visited. */
  selectedRowIds: string[];
  /** Selected rows among those currently loaded (the current page). */
  selectedRows: TRow[];
  /** `true` when every row on the current page is selected. */
  isAllRowsSelected: boolean;
  /** `true` when some but not all current-page rows are selected. */
  isSomeRowsSelected: boolean;
}

/**
 * Headless hook that owns the state of a server-driven data table.
 *
 * @example
 * const table = useServerTable({
 *   fetchData: async ({ pagination, sorting, filters }, { signal }) => {
 *     const res = await fetch(buildUrl(pagination, sorting, filters), { signal });
 *     const { rows, total } = await res.json();
 *     return { rows, total };
 *   },
 *   getRowId: (row) => row.id,
 * });
 */
export function useServerTable<TRow>(
  options: UseServerTableOptions<TRow>,
): ServerTableInstance<TRow> {
  const { fetchData, initialState, pageSize } = options;

  const [pagination, setPagination] = useState<PaginationState>(() => ({
    pageIndex: initialState?.pagination?.pageIndex ?? 0,
    pageSize:
      initialState?.pagination?.pageSize ?? pageSize ?? DEFAULT_PAGE_SIZE,
  }));
  const [sorting, setSortingState] = useState<SortState[]>(
    () => initialState?.sorting ?? [],
  );
  const [filters, setFiltersState] = useState<FilterState[]>(
    () => initialState?.filters ?? [],
  );
  const [selection, setSelection] = useState<Record<string, boolean>>(
    () => initialState?.selection ?? {},
  );

  const [rows, setRows] = useState<TRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  // Keep the latest fetchData in a ref — assigned in an effect (not during
  // render, so it is safe under concurrent rendering) — so that an unstable
  // (inline) fetcher does not retrigger the fetch effect.
  const fetchDataRef = useRef<FetchData<TRow>>(fetchData);
  useEffect(() => {
    fetchDataRef.current = fetchData;
  });

  // getRowId is resolved every render and threaded through the selection
  // callbacks'/memos' dependency arrays, so derived selection state stays
  // correct even when the consumer passes a new getRowId identity.
  const getRowId = options.getRowId ?? defaultGetRowId<TRow>;

  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    setIsFetching(true);

    const params = { pagination, sorting, filters };
    fetchDataRef
      .current(params, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return; // unmounted / superseded
        if (requestId !== requestIdRef.current) return; // superseded
        setRows(result.rows);
        setTotal(result.total);
        setError(null);
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return; // superseded
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (controller.signal.aborted) return; // unmounted / superseded
        if (requestId !== requestIdRef.current) return;
        setIsFetching(false);
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
    // We depend on the pagination fields explicitly (the object is re-created
    // only when a field changes) and on the `sorting`/`filters` state arrays by
    // identity — those references change only when our own setters run, so they
    // are a faithful change signal without serialising (which could throw on
    // BigInt/circular filter values).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pagination.pageIndex,
    pagination.pageSize,
    sorting,
    filters,
    reloadCount,
  ]);

  const reload = useCallback(() => setReloadCount((c) => c + 1), []);

  const pageCount = useMemo(
    () =>
      pagination.pageSize > 0 ? Math.ceil(total / pagination.pageSize) : 0,
    [total, pagination.pageSize],
  );

  // ── Pagination controls ─────────────────────────────────────────────────
  const setPageIndex = useCallback((updater: Updater<number>) => {
    setPagination((prev) => {
      const next = Math.max(0, applyUpdater(updater, prev.pageIndex));
      return next === prev.pageIndex ? prev : { ...prev, pageIndex: next };
    });
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPagination((prev) =>
      prev.pageSize === size && prev.pageIndex === 0
        ? prev
        : { pageIndex: 0, pageSize: size },
    );
  }, []);

  const nextPage = useCallback(
    () =>
      setPageIndex((i) => (pageCount > 0 ? Math.min(i + 1, pageCount - 1) : i)),
    [setPageIndex, pageCount],
  );
  const previousPage = useCallback(
    () => setPageIndex((i) => i - 1),
    [setPageIndex],
  );

  const canPreviousPage = pagination.pageIndex > 0;
  const canNextPage = pagination.pageIndex < pageCount - 1;

  // ── Sorting controls ──────────────────────────────────────────────────────
  const setSorting = useCallback((updater: Updater<SortState[]>) => {
    setSortingState((prev) => applyUpdater(updater, prev));
    setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 }));
  }, []);

  const toggleSort = useCallback(
    (columnId: string, opts?: { multi?: boolean }) => {
      const multi = opts?.multi ?? false;
      setSorting((prev) => {
        const existing = prev.find((s) => s.id === columnId);
        const others = multi ? prev.filter((s) => s.id !== columnId) : [];
        if (!existing) return [...others, { id: columnId, desc: false }];
        if (!existing.desc)
          return [...others, { id: columnId, desc: true }];
        return others; // was desc → remove
      });
    },
    [setSorting],
  );

  const getSort = useCallback(
    (columnId: string): SortDirection | false => {
      const s = sorting.find((entry) => entry.id === columnId);
      if (!s) return false;
      return s.desc ? "desc" : "asc";
    },
    [sorting],
  );

  // ── Filtering controls ────────────────────────────────────────────────────
  const setFilters = useCallback((updater: Updater<FilterState[]>) => {
    setFiltersState((prev) => applyUpdater(updater, prev));
    setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 }));
  }, []);

  const setFilter = useCallback(
    (columnId: string, value: unknown) => {
      setFilters((prev) => {
        const others = prev.filter((f) => f.id !== columnId);
        if (value === undefined) return others;
        return [...others, { id: columnId, value }];
      });
    },
    [setFilters],
  );

  const clearFilters = useCallback(() => setFilters([]), [setFilters]);

  const getFilter = useCallback(
    (columnId: string): unknown =>
      filters.find((f) => f.id === columnId)?.value,
    [filters],
  );

  // ── Selection controls ────────────────────────────────────────────────────
  const isRowSelected = useCallback(
    (row: TRow, index: number) => selection[getRowId(row, index)] === true,
    [selection, getRowId],
  );

  const toggleRowSelected = useCallback(
    (row: TRow, index: number, value?: boolean) => {
      const id = getRowId(row, index);
      setSelection((prev) => {
        const nextValue = value ?? prev[id] !== true;
        if (nextValue) return { ...prev, [id]: true };
        if (!(id in prev)) return prev;
        const { [id]: _removed, ...rest } = prev;
        return rest;
      });
    },
    [getRowId],
  );

  const toggleAllRowsSelected = useCallback(
    (value?: boolean) => {
      setSelection((prev) => {
        const allSelected =
          rows.length > 0 &&
          rows.every((row, i) => prev[getRowId(row, i)] === true);
        const nextValue = value ?? !allSelected;
        const next = { ...prev };
        rows.forEach((row, i) => {
          const id = getRowId(row, i);
          if (nextValue) next[id] = true;
          else delete next[id];
        });
        return next;
      });
    },
    [rows, getRowId],
  );

  const clearSelection = useCallback(() => setSelection({}), []);

  const selectedRowIds = useMemo(
    () => Object.keys(selection).filter((id) => selection[id]),
    [selection],
  );

  const selectedRows = useMemo(
    () => rows.filter((row, i) => selection[getRowId(row, i)] === true),
    [rows, selection, getRowId],
  );

  const isAllRowsSelected = useMemo(
    () =>
      rows.length > 0 &&
      rows.every((row, i) => selection[getRowId(row, i)] === true),
    [rows, selection, getRowId],
  );

  const isSomeRowsSelected = useMemo(
    () =>
      !isAllRowsSelected &&
      rows.some((row, i) => selection[getRowId(row, i)] === true),
    [rows, selection, getRowId, isAllRowsSelected],
  );

  return {
    rows,
    total,
    pageCount,
    isLoading,
    isFetching,
    error,
    reload,

    pagination,
    setPageIndex,
    setPageSize,
    nextPage,
    previousPage,
    canPreviousPage,
    canNextPage,

    sorting,
    setSorting,
    toggleSort,
    getSort,

    filters,
    setFilter,
    setFilters,
    clearFilters,
    getFilter,

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
