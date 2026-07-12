# react-server-table

Headless React hooks for **server-driven data tables** — pagination, sorting, filtering, and row selection — with a bring-your-own async fetcher.

## The problem

When a table's data lives on the server, the client still has to do a surprising amount of bookkeeping:

- track the current **page, page size, sort, and active filters**,
- turn all of that into a request and **re-fetch whenever any of it changes**,
- **drop stale responses** when the user clicks faster than the network replies,
- **reset to the first page** when the filters change,
- and **remember which rows are selected** as the user moves between pages.

Every app rebuilds this, and it's easy to get the race conditions wrong.

`react-server-table` owns that state for you. You give it **one async function** that fetches a page; it hands back everything you need to render the table and its controls. It ships **no markup and no styling** — you stay in full control of how it looks — and it doesn't care how you fetch (raw `fetch`, React Query, SWR, anything).

## Install

```sh
npm install @umairalee/react-server-table
# or: pnpm add @umairalee/react-server-table
```

React 17, 18, or 19 (peer dependency).

## Quick start

Give the hook a `fetchData` function. It's called with the current `{ pagination, sorting, filters }` and must return `{ rows, total }`. That's the whole contract.

```tsx
import { useServerTable } from "@umairalee/react-server-table";

interface User {
  id: number;
  name: string;
  email: string;
}

function UsersTable() {
  const table = useServerTable<User>({
    getRowId: (row) => String(row.id),
    fetchData: async ({ pagination, sorting, filters }, { signal }) => {
      const params = new URLSearchParams({
        page: String(pagination.pageIndex),
        size: String(pagination.pageSize),
      });
      for (const s of sorting)
        params.append("sort", `${s.id}:${s.desc ? "desc" : "asc"}`);
      for (const f of filters) params.append(`filter.${f.id}`, String(f.value));

      const res = await fetch(`/api/users?${params}`, { signal });
      return res.json(); // → { rows: User[]; total: number }
    },
  });

  if (table.error) return <p>Failed to load: {table.error.message}</p>;

  return (
    <>
      <table>
        <thead>
          <tr>
            <th onClick={() => table.toggleSort("name")}>
              Name{" "}
              {table.getSort("name") === "asc"
                ? "▲"
                : table.getSort("name") === "desc"
                  ? "▼"
                  : ""}
            </th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              <td>{row.email}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <button disabled={!table.canPreviousPage} onClick={table.previousPage}>
        Prev
      </button>
      <span>
        Page {table.pagination.pageIndex + 1} of {table.pageCount}
      </span>
      <button disabled={!table.canNextPage} onClick={table.nextPage}>
        Next
      </button>
      {table.isFetching && <span> Loading…</span>}
    </>
  );
}
```

## Recipes

Short, focused snippets. `table` is the object returned by `useServerTable` above.

### Sort a column header

`toggleSort` cycles a column **unsorted → ascending → descending → unsorted**. Pass `{ multi: true }` to keep other columns sorted too.

```tsx
<th onClick={() => table.toggleSort("name")}>Name {table.getSort("name")}</th>
<th onClick={(e) => table.toggleSort("createdAt", { multi: e.shiftKey })}>Created</th>
```

### A search / filter box

Set a filter by column id; pass `undefined` to clear it. Changing a filter automatically **resets back to page 1**.

```tsx
<input
  placeholder="Search name…"
  value={String(table.getFilter("name") ?? "")}
  onChange={(e) => table.setFilter("name", e.target.value || undefined)}
/>
```

### Row selection with “select all”

Selection is kept for you, keyed by `getRowId`, and **survives pagination**.

```tsx
<th>
  <input
    type="checkbox"
    checked={table.isAllRowsSelected}
    ref={(el) => el && (el.indeterminate = table.isSomeRowsSelected)}
    onChange={() => table.toggleAllRowsSelected()}
  />
</th>
// …per row:
<td>
  <input
    type="checkbox"
    checked={table.isRowSelected(row, i)}
    onChange={() => table.toggleRowSelected(row, i)}
  />
</td>

// Act on the selection:
<button onClick={() => deleteUsers(table.selectedRowIds)}>
  Delete {table.selectedRowIds.length} selected
</button>
```

### Use it with React Query (or SWR)

`useServerTable` can just own the **state** while React Query owns the **fetching**. Key your query off the table's state:

```tsx
const table = useServerTable<User>({
  getRowId: (r) => String(r.id),
  fetchData,
});

const query = useQuery({
  queryKey: ["users", table.pagination, table.sorting, table.filters],
  queryFn: ({ signal }) =>
    fetchUsers(
      {
        pagination: table.pagination,
        sorting: table.sorting,
        filters: table.filters,
      },
      { signal },
    ),
});
```

> Pick one source of truth: either let `useServerTable` fetch via `fetchData`, **or** use it purely for state and fetch with React Query. Don't do both for the same data.

### Seed initial state

```tsx
useServerTable<User>({
  fetchData,
  getRowId: (r) => String(r.id),
  pageSize: 25,
  initialState: {
    sorting: [{ id: "name", desc: false }],
    filters: [{ id: "status", value: "active" }],
  },
});
```

## API

### `useServerTable(options)`

| Option         | Type                                                   | Default           | Notes                                                                                                            |
| -------------- | ------------------------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `fetchData`    | `(params, { signal }) => Promise<{ rows, total }>`     | —                 | **Required.** Called whenever pagination/sorting/filters change. Forward `signal` to cancel superseded requests. |
| `getRowId`     | `(row, index) => string`                               | `row.id` ?? index | Stable id for selection. Provide a primary key so selection survives pagination.                                 |
| `initialState` | `Partial<{ pagination, sorting, filters, selection }>` | —                 | Seed initial state.                                                                                              |
| `pageSize`     | `number`                                               | `10`              | Used when `initialState.pagination` is omitted.                                                                  |

### Returned instance

**Data** — `rows`, `total`, `pageCount`, `isLoading`, `isFetching`, `error`, `reload()`

**Pagination** — `pagination`, `setPageIndex(updater)`, `setPageSize(size)`, `nextPage()`, `previousPage()`, `canPreviousPage`, `canNextPage`

**Sorting** — `sorting`, `setSorting(updater)`, `toggleSort(columnId, { multi? })`, `getSort(columnId)` → `"asc" | "desc" | false`

**Filtering** — `filters`, `setFilter(columnId, value)` (pass `undefined` to remove), `setFilters(updater)`, `clearFilters()`, `getFilter(columnId)`

**Selection** — `selection`, `isRowSelected(row, i)`, `toggleRowSelected(row, i, value?)`, `toggleAllRowsSelected(value?)`, `clearSelection()`, `selectedRowIds`, `selectedRows`, `isAllRowsSelected`, `isSomeRowsSelected`

## How it behaves

- **Changing sort or filters resets to page 0** — the standard table UX.
- **Stale responses are dropped.** If requests overlap, only the most recent result is applied; forward the provided `signal` to your `fetch` to also cancel in-flight work.
- **Selection persists across pages**, keyed by `getRowId`. `selectedRowIds` holds every selected id; `selectedRows` and `isAllRowsSelected` describe only the **currently-loaded page** (the hook only holds the rows your fetcher returned for it).
- **`isLoading`** is `true` until the first fetch settles; **`isFetching`** is `true` for every fetch, including background refetches.

## Cursor pagination

When your API paginates by opaque cursors instead of page numbers (no total count, no jumping to page N), use **`useCursorTable`**. It supports both a **paged** view (Next/Prev) and an **infinite** view (load-more) over the same loaded-page cache — pick whichever your UI needs.

Your fetcher takes a `cursor` (`null` on the first page) and returns the page's rows plus the `nextCursor` (`null` when there are no more):

```tsx
import { useCursorTable } from "@umairalee/react-server-table";

const table = useCursorTable<User>({
  getRowId: (row) => String(row.id),
  limit: 20,
  fetchData: async ({ cursor, limit, sorting, filters }, { signal }) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/users?${params}`, { signal });
    const json = await res.json(); // → { rows: User[]; nextCursor: string | null }
    return { rows: json.rows, nextCursor: json.nextCursor };
  },
});
```

**Paged (Next / Prev):**

```tsx
{table.rows.map((u) => <Row key={u.id} user={u} />)}

<button disabled={!table.canPreviousPage} onClick={table.previousPage}>Prev</button>
<button disabled={!table.canNextPage} onClick={table.nextPage}>Next</button>
```

**Infinite (load-more):**

```tsx
{
  table.allRows.map((u) => <Row key={u.id} user={u} />);
}

{
  table.hasMore && (
    <button disabled={table.isFetching} onClick={table.loadMore}>
      Load more
    </button>
  );
}
```

Sorting, filtering, and selection work exactly like `useServerTable` (changing sort/filters resets to the first page). Selection and `selectedRows` here span **all loaded rows**, not just one page. There's no `total`/`pageCount` — cursor APIs don't provide them.

## Not in scope (yet)

Row virtualization, column resize/reorder, and CSV export are on the roadmap, not in the box today. The core stays small and headless on purpose.

## License

MIT
