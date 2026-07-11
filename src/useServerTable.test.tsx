import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useServerTable } from "./useServerTable";
import type { FetchDataResult, ServerTableParams } from "./types";

interface Row {
  id: number;
  name: string;
}

function makeRows(pageIndex: number, pageSize: number): Row[] {
  return Array.from({ length: pageSize }, (_, i) => {
    const n = pageIndex * pageSize + i;
    return { id: n, name: `row-${n}` };
  });
}

const TOTAL = 53;

/** A fetcher that returns deterministic rows for the requested page. */
function makeFetcher() {
  return vi.fn(
    async ({ pagination }: ServerTableParams): Promise<FetchDataResult<Row>> => ({
      rows: makeRows(pagination.pageIndex, pagination.pageSize),
      total: TOTAL,
    }),
  );
}

const getRowId = (row: Row) => String(row.id);

describe("useServerTable — initial fetch", () => {
  it("starts loading, then populates rows/total/pageCount", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rows).toHaveLength(10);
    expect(result.current.total).toBe(TOTAL);
    expect(result.current.pageCount).toBe(6); // ceil(53 / 10)
    expect(result.current.isFetching).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fetchData).toHaveBeenCalledTimes(1);
    expect(fetchData.mock.calls[0][0].pagination).toEqual({
      pageIndex: 0,
      pageSize: 10,
    });
  });

  it("honours pageSize option and initialState", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({
        fetchData,
        getRowId,
        initialState: {
          pagination: { pageIndex: 2, pageSize: 5 },
          sorting: [{ id: "name", desc: true }],
          filters: [{ id: "name", value: "x" }],
          selection: { "999": true },
        },
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pagination).toEqual({ pageIndex: 2, pageSize: 5 });
    expect(fetchData.mock.calls[0][0]).toEqual({
      pagination: { pageIndex: 2, pageSize: 5 },
      sorting: [{ id: "name", desc: true }],
      filters: [{ id: "name", value: "x" }],
    });
    expect(result.current.selectedRowIds).toEqual(["999"]);
  });

  it("uses the pageSize option when no initial pagination is given", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId, pageSize: 25 }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pagination.pageSize).toBe(25);
  });
});

describe("useServerTable — pagination", () => {
  it("navigates pages and reports canPrevious/canNext", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.canPreviousPage).toBe(false);
    expect(result.current.canNextPage).toBe(true);

    act(() => result.current.nextPage());
    await waitFor(() => expect(result.current.pagination.pageIndex).toBe(1));
    expect(result.current.rows[0].id).toBe(10);
    expect(result.current.canPreviousPage).toBe(true);

    act(() => result.current.previousPage());
    await waitFor(() => expect(result.current.pagination.pageIndex).toBe(0));
  });

  it("does not go below page 0 (and does not refetch)", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchData).toHaveBeenCalledTimes(1);

    act(() => result.current.previousPage());
    expect(result.current.pagination.pageIndex).toBe(0);
    expect(fetchData).toHaveBeenCalledTimes(1);
  });

  it("reports canNextPage=false on the last page", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setPageIndex(5)); // last page (0-based, 6 pages)
    await waitFor(() => expect(result.current.pagination.pageIndex).toBe(5));
    expect(result.current.canNextPage).toBe(false);
    expect(result.current.canPreviousPage).toBe(true);
  });

  it("setPageSize resets to page 0", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setPageIndex(3));
    await waitFor(() => expect(result.current.pagination.pageIndex).toBe(3));

    act(() => result.current.setPageSize(25));
    await waitFor(() =>
      expect(result.current.pagination).toEqual({ pageIndex: 0, pageSize: 25 }),
    );
  });
});

describe("useServerTable — sorting", () => {
  it("cycles a column unsorted → asc → desc → unsorted", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.getSort("name")).toBe(false);

    act(() => result.current.toggleSort("name"));
    await waitFor(() => expect(result.current.getSort("name")).toBe("asc"));
    expect(result.current.sorting).toEqual([{ id: "name", desc: false }]);

    act(() => result.current.toggleSort("name"));
    await waitFor(() => expect(result.current.getSort("name")).toBe("desc"));

    act(() => result.current.toggleSort("name"));
    await waitFor(() => expect(result.current.getSort("name")).toBe(false));
    expect(result.current.sorting).toEqual([]);
  });

  it("single-sort replaces other columns; multi keeps them", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleSort("a"));
    act(() => result.current.toggleSort("b", { multi: true }));
    await waitFor(() => expect(result.current.sorting).toHaveLength(2));
    expect(result.current.getSort("a")).toBe("asc");
    expect(result.current.getSort("b")).toBe("asc");

    act(() => result.current.toggleSort("c")); // single → replaces
    await waitFor(() =>
      expect(result.current.sorting).toEqual([{ id: "c", desc: false }]),
    );
  });

  it("changing sort resets to page 0", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setPageIndex(3));
    await waitFor(() => expect(result.current.pagination.pageIndex).toBe(3));

    act(() => result.current.toggleSort("name"));
    await waitFor(() => expect(result.current.pagination.pageIndex).toBe(0));
  });
});

describe("useServerTable — filtering", () => {
  it("sets, reads, and removes a single filter", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setFilter("name", "foo"));
    await waitFor(() => expect(result.current.getFilter("name")).toBe("foo"));
    expect(result.current.filters).toEqual([{ id: "name", value: "foo" }]);

    act(() => result.current.setFilter("name", undefined)); // remove
    await waitFor(() => expect(result.current.filters).toEqual([]));
  });

  it("clearFilters empties all filters", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setFilter("a", 1));
    act(() => result.current.setFilter("b", 2));
    await waitFor(() => expect(result.current.filters).toHaveLength(2));

    act(() => result.current.clearFilters());
    await waitFor(() => expect(result.current.filters).toEqual([]));
  });

  it("changing a filter resets to page 0 and passes filters to the fetcher", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setPageIndex(4));
    await waitFor(() => expect(result.current.pagination.pageIndex).toBe(4));

    act(() => result.current.setFilter("name", "q"));
    await waitFor(() => expect(result.current.pagination.pageIndex).toBe(0));

    const calls = fetchData.mock.calls;
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall.filters).toEqual([{ id: "name", value: "q" }]);
  });
});

describe("useServerTable — selection", () => {
  it("toggles a single row and reflects it in derived state", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const row0 = result.current.rows[0];

    act(() => result.current.toggleRowSelected(row0, 0));
    expect(result.current.isRowSelected(row0, 0)).toBe(true);
    expect(result.current.selectedRowIds).toEqual(["0"]);
    expect(result.current.selectedRows).toEqual([row0]);
    expect(result.current.isSomeRowsSelected).toBe(true);
    expect(result.current.isAllRowsSelected).toBe(false);

    act(() => result.current.toggleRowSelected(row0, 0));
    expect(result.current.isRowSelected(row0, 0)).toBe(false);
    expect(result.current.selectedRowIds).toEqual([]);
  });

  it("respects an explicit value argument", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const row0 = result.current.rows[0];

    act(() => result.current.toggleRowSelected(row0, 0, false)); // already off
    expect(result.current.isRowSelected(row0, 0)).toBe(false);
    act(() => result.current.toggleRowSelected(row0, 0, true));
    act(() => result.current.toggleRowSelected(row0, 0, true)); // idempotent
    expect(result.current.selectedRowIds).toEqual(["0"]);
  });

  it("selects/deselects all rows on the current page", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleAllRowsSelected());
    expect(result.current.isAllRowsSelected).toBe(true);
    expect(result.current.selectedRowIds).toHaveLength(10);

    act(() => result.current.toggleAllRowsSelected());
    expect(result.current.isAllRowsSelected).toBe(false);
    expect(result.current.selectedRowIds).toEqual([]);
  });

  it("clearSelection wipes selection across pages", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleAllRowsSelected());
    act(() => result.current.clearSelection());
    expect(result.current.selectedRowIds).toEqual([]);
  });

  it("keeps selection when navigating pages (keyed by rowId)", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const row0 = result.current.rows[0];
    act(() => result.current.toggleRowSelected(row0, 0));

    act(() => result.current.nextPage());
    await waitFor(() => expect(result.current.pagination.pageIndex).toBe(1));

    // Selection map still holds the page-0 row.
    expect(result.current.selectedRowIds).toEqual(["0"]);
    // But no current-page row is selected.
    expect(result.current.isAllRowsSelected).toBe(false);
    expect(result.current.selectedRows).toEqual([]);
  });
});

describe("useServerTable — fetch lifecycle", () => {
  it("ignores a stale response that resolves after a newer one", async () => {
    const resolvers: Array<(v: FetchDataResult<Row>) => void> = [];
    const fetchData = vi.fn(
      ({ pagination }: ServerTableParams) =>
        new Promise<FetchDataResult<Row>>((resolve) => {
          resolvers.push((v) => resolve(v ?? {
            rows: makeRows(pagination.pageIndex, pagination.pageSize),
            total: TOTAL,
          }));
        }),
    );

    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );

    // Trigger a second request (page 1) while the first (page 0) is pending.
    act(() => result.current.nextPage());
    await waitFor(() => expect(resolvers).toHaveLength(2));

    // Resolve the NEWER request first (page 1).
    act(() => resolvers[1]({ rows: makeRows(1, 10), total: TOTAL }));
    await waitFor(() => expect(result.current.rows[0]?.id).toBe(10));

    // Now resolve the STALE request (page 0) — it must be ignored.
    act(() => resolvers[0]({ rows: makeRows(0, 10), total: TOTAL }));
    expect(result.current.rows[0]?.id).toBe(10);
  });

  it("captures fetch errors", async () => {
    const fetchData = vi.fn(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.error?.message).toBe("boom");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("clears a prior error on a successful refetch", async () => {
    let shouldFail = true;
    const fetchData = vi.fn(
      async ({ pagination }: ServerTableParams): Promise<FetchDataResult<Row>> => {
        if (shouldFail) throw new Error("boom");
        return { rows: makeRows(pagination.pageIndex, pagination.pageSize), total: TOTAL };
      },
    );
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));

    shouldFail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.rows).toHaveLength(10);
  });

  it("reload refetches with the same params", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchData).toHaveBeenCalledTimes(1);

    act(() => result.current.reload());
    await waitFor(() => expect(fetchData).toHaveBeenCalledTimes(2));
  });

  it("does not refetch when an inline fetchData identity changes on rerender", async () => {
    let calls = 0;
    const { result, rerender } = renderHook(() =>
      // New function identity every render — must not loop.
      useServerTable<Row>({
        fetchData: async ({ pagination }) => {
          calls++;
          return {
            rows: makeRows(pagination.pageIndex, pagination.pageSize),
            total: TOTAL,
          };
        },
        getRowId,
      }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const callsAfterFirst = calls;
    rerender();
    rerender();
    // No new fetch from rerenders alone.
    expect(calls).toBe(callsAfterFirst);
  });
});

describe("useServerTable — regression (code review)", () => {
  it("does not crash render when a filter value is not JSON-serializable (BigInt)", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() =>
      useServerTable({ fetchData, getRowId }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchData).toHaveBeenCalledTimes(1);

    // A BigInt (or circular) filter value used to crash render via JSON.stringify.
    expect(() => {
      act(() => result.current.setFilter("qty", 10n));
    }).not.toThrow();

    // Setting the filter still drives a refetch (deps compare by array identity).
    await waitFor(() => expect(fetchData).toHaveBeenCalledTimes(2));
    expect(result.current.getFilter("qty")).toBe(10n);
  });
});

describe("useServerTable — default getRowId", () => {
  beforeEach(() => {
    // no-op; each test builds its own hook
  });

  it("falls back to the row's id field when getRowId is omitted", async () => {
    const fetchData = makeFetcher();
    const { result } = renderHook(() => useServerTable({ fetchData }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const row0 = result.current.rows[0];
    act(() => result.current.toggleRowSelected(row0, 0));
    expect(result.current.selectedRowIds).toEqual(["0"]);
  });
});
