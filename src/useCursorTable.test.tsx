import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCursorTable } from "./useCursorTable";
import type { CursorFetchResult, CursorTableParams } from "./types";

interface Row {
  id: number;
  name: string;
}

const TOTAL = 25; // → pages of 10: [0-9], [10-19], [20-24]

/** A fetcher over a fixed dataset; the cursor is the numeric offset as a string. */
function makeCursorFetcher() {
  return vi.fn(
    async ({
      cursor,
      limit,
    }: CursorTableParams): Promise<CursorFetchResult<Row>> => {
      const start = cursor == null ? 0 : Number(cursor);
      const end = Math.min(start + limit, TOTAL);
      const rows: Row[] = [];
      for (let n = start; n < end; n++) rows.push({ id: n, name: `row-${n}` });
      return { rows, nextCursor: end < TOTAL ? String(end) : null };
    },
  );
}

const getRowId = (row: Row) => String(row.id);
const lastCall = (fn: ReturnType<typeof makeCursorFetcher>): CursorTableParams =>
  fn.mock.calls[fn.mock.calls.length - 1][0];

describe("useCursorTable — initial fetch", () => {
  it("loads the first page (cursor null)", async () => {
    const fetchData = makeCursorFetcher();
    const { result } = renderHook(() =>
      useCursorTable({ fetchData, getRowId, limit: 10 }),
    );

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rows).toHaveLength(10);
    expect(result.current.rows[0].id).toBe(0);
    expect(result.current.pageIndex).toBe(0);
    expect(result.current.canPreviousPage).toBe(false);
    expect(result.current.canNextPage).toBe(true);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.error).toBeNull();
    expect(fetchData.mock.calls[0][0].cursor).toBeNull();
  });
});

describe("useCursorTable — paged navigation", () => {
  it("fetches the next page and returns to earlier pages from cache", async () => {
    const fetchData = makeCursorFetcher();
    const { result } = renderHook(() =>
      useCursorTable({ fetchData, getRowId, limit: 10 }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.nextPage());
    await waitFor(() => expect(result.current.pageIndex).toBe(1));
    expect(result.current.rows[0].id).toBe(10);
    expect(fetchData).toHaveBeenCalledTimes(2);
    expect(fetchData.mock.calls[1][0].cursor).toBe("10");
    expect(result.current.canPreviousPage).toBe(true);

    // previousPage uses the cache — no new fetch.
    act(() => result.current.previousPage());
    await waitFor(() => expect(result.current.pageIndex).toBe(0));
    expect(result.current.rows[0].id).toBe(0);
    expect(fetchData).toHaveBeenCalledTimes(2);

    // nextPage to an already-loaded page — still no new fetch.
    act(() => result.current.nextPage());
    await waitFor(() => expect(result.current.pageIndex).toBe(1));
    expect(fetchData).toHaveBeenCalledTimes(2);
  });

  it("stops at the last page", async () => {
    const fetchData = makeCursorFetcher();
    const { result } = renderHook(() =>
      useCursorTable({ fetchData, getRowId, limit: 10 }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.nextPage());
    await waitFor(() => expect(result.current.pageIndex).toBe(1));
    act(() => result.current.nextPage());
    await waitFor(() => expect(result.current.pageIndex).toBe(2));

    expect(result.current.rows).toHaveLength(5); // 20-24
    expect(result.current.hasMore).toBe(false);
    expect(result.current.canNextPage).toBe(false);

    const calls = fetchData.mock.calls.length;
    act(() => result.current.nextPage()); // no-op at the end
    expect(result.current.pageIndex).toBe(2);
    expect(fetchData).toHaveBeenCalledTimes(calls);
  });
});

describe("useCursorTable — infinite (loadMore)", () => {
  it("accumulates rows across pages and stops when exhausted", async () => {
    const fetchData = makeCursorFetcher();
    const { result } = renderHook(() =>
      useCursorTable({ fetchData, getRowId, limit: 10 }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.allRows).toHaveLength(10);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.allRows).toHaveLength(20));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.allRows).toHaveLength(25));
    expect(result.current.hasMore).toBe(false);

    const calls = fetchData.mock.calls.length;
    act(() => result.current.loadMore()); // no-op
    expect(fetchData).toHaveBeenCalledTimes(calls);
  });
});

describe("useCursorTable — reset / reload", () => {
  it("clears loaded pages and refetches from the first page", async () => {
    const fetchData = makeCursorFetcher();
    const { result } = renderHook(() =>
      useCursorTable({ fetchData, getRowId, limit: 10 }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.allRows).toHaveLength(20));

    act(() => result.current.reset());
    await waitFor(() => expect(result.current.allRows).toHaveLength(10));
    expect(result.current.pageIndex).toBe(0);
    expect(lastCall(fetchData).cursor).toBeNull();
  });
});

describe("useCursorTable — sorting & filtering reset to the first page", () => {
  it("toggleSort resets pages and refetches with sorting", async () => {
    const fetchData = makeCursorFetcher();
    const { result } = renderHook(() =>
      useCursorTable({ fetchData, getRowId, limit: 10 }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.nextPage());
    await waitFor(() => expect(result.current.pageIndex).toBe(1));

    act(() => result.current.toggleSort("name"));
    await waitFor(() => expect(result.current.pageIndex).toBe(0));
    expect(result.current.getSort("name")).toBe("asc");
    expect(lastCall(fetchData).sorting).toEqual([{ id: "name", desc: false }]);
    expect(lastCall(fetchData).cursor).toBeNull();
  });

  it("setFilter resets pages and refetches with filters", async () => {
    const fetchData = makeCursorFetcher();
    const { result } = renderHook(() =>
      useCursorTable({ fetchData, getRowId, limit: 10 }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.nextPage());
    await waitFor(() => expect(result.current.pageIndex).toBe(1));

    act(() => result.current.setFilter("name", "q"));
    await waitFor(() => expect(result.current.pageIndex).toBe(0));
    expect(result.current.getFilter("name")).toBe("q");
    expect(lastCall(fetchData).filters).toEqual([{ id: "name", value: "q" }]);
  });

  it("setLimit resets and refetches with the new limit", async () => {
    const fetchData = makeCursorFetcher();
    const { result } = renderHook(() =>
      useCursorTable({ fetchData, getRowId, limit: 10 }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setLimit(5));
    await waitFor(() => expect(result.current.rows).toHaveLength(5));
    expect(result.current.pageIndex).toBe(0);
    expect(lastCall(fetchData).limit).toBe(5);
    expect(lastCall(fetchData).cursor).toBeNull();
  });
});

describe("useCursorTable — selection over all loaded rows", () => {
  it("selects rows and select-all across every loaded page", async () => {
    const fetchData = makeCursorFetcher();
    const { result } = renderHook(() =>
      useCursorTable({ fetchData, getRowId, limit: 10 }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.allRows).toHaveLength(20));

    const r0 = result.current.allRows[0];
    act(() => result.current.toggleRowSelected(r0, 0));
    expect(result.current.isRowSelected(r0, 0)).toBe(true);
    expect(result.current.selectedRowIds).toEqual(["0"]);
    expect(result.current.isSomeRowsSelected).toBe(true);
    expect(result.current.isAllRowsSelected).toBe(false);

    act(() => result.current.toggleAllRowsSelected());
    expect(result.current.isAllRowsSelected).toBe(true);
    expect(result.current.selectedRowIds).toHaveLength(20);

    act(() => result.current.toggleAllRowsSelected());
    expect(result.current.selectedRowIds).toEqual([]);
  });
});

describe("useCursorTable — fetch lifecycle", () => {
  it("ignores a stale response that resolves after a newer one", async () => {
    const resolvers: Array<(v: CursorFetchResult<Row>) => void> = [];
    const fetchData = vi.fn(
      () =>
        new Promise<CursorFetchResult<Row>>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { result } = renderHook(() =>
      useCursorTable({ fetchData, getRowId, limit: 10 }),
    );

    // Trigger a second (reset) request while the first is still pending.
    act(() => result.current.reset());
    await waitFor(() => expect(resolvers).toHaveLength(2));

    act(() => resolvers[1]({ rows: [{ id: 99, name: "new" }], nextCursor: null }));
    await waitFor(() => expect(result.current.rows[0]?.id).toBe(99));

    // Stale first request resolves last — must be ignored.
    act(() => resolvers[0]({ rows: [{ id: 0, name: "old" }], nextCursor: "10" }));
    expect(result.current.rows[0]?.id).toBe(99);
  });

  it("does not yank the user to a new page if they navigate away during a nextPage fetch", async () => {
    let releaseAppend: ((v: CursorFetchResult<Row>) => void) | undefined;
    const fetchData = vi.fn(
      ({ cursor }: CursorTableParams): Promise<CursorFetchResult<Row>> => {
        const start = cursor == null ? 0 : Number(cursor);
        if (start < 4) {
          return Promise.resolve({
            rows: [
              { id: start, name: `r${start}` },
              { id: start + 1, name: `r${start + 1}` },
            ],
            nextCursor: String(start + 2),
          });
        }
        return new Promise((res) => {
          releaseAppend = res;
        });
      },
    );
    const { result } = renderHook(() =>
      useCursorTable({ fetchData, getRowId, limit: 2 }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.nextPage());
    await waitFor(() => expect(result.current.pageIndex).toBe(1));

    // Launch a deferred append for page 2, then navigate back to page 0.
    act(() => result.current.nextPage());
    await waitFor(() => expect(fetchData).toHaveBeenCalledTimes(3));
    act(() => result.current.previousPage());
    await waitFor(() => expect(result.current.pageIndex).toBe(0));

    // Resolving the append must NOT advance the user (they moved away).
    await act(async () => {
      releaseAppend?.({ rows: [{ id: 4, name: "r4" }], nextCursor: null });
    });
    expect(result.current.pageIndex).toBe(0);
  });

  it("captures fetch errors", async () => {
    const fetchData = vi.fn(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() =>
      useCursorTable({ fetchData, getRowId, limit: 10 }),
    );
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.error?.message).toBe("boom");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it("does not refetch when an inline fetchData identity changes on rerender", async () => {
    let calls = 0;
    const { result, rerender } = renderHook(() =>
      useCursorTable<Row>({
        fetchData: async ({ cursor, limit }) => {
          calls++;
          const start = cursor == null ? 0 : Number(cursor);
          const end = Math.min(start + limit, TOTAL);
          const rows: Row[] = [];
          for (let n = start; n < end; n++) rows.push({ id: n, name: `row-${n}` });
          return { rows, nextCursor: end < TOTAL ? String(end) : null };
        },
        getRowId,
        limit: 10,
      }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const after = calls;
    rerender();
    rerender();
    expect(calls).toBe(after);
  });
});

describe("useCursorTable — default getRowId", () => {
  it("falls back to the row id field when getRowId is omitted", async () => {
    const fetchData = makeCursorFetcher();
    const { result } = renderHook(() =>
      useCursorTable({ fetchData, limit: 10 }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const r0 = result.current.rows[0];
    act(() => result.current.toggleRowSelected(r0, 0));
    expect(result.current.selectedRowIds).toEqual(["0"]);
  });
});
