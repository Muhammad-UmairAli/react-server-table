# react-server-table

Headless React hooks for **server-driven data tables** — pagination, sorting, filtering, and row selection — with a bring-your-own async fetcher.

- **Headless.** No markup, no styling. You render; the hook owns the state.
- **Server-first.** Pagination, sorting, and filtering state are handed to _your_ fetcher; the server does the work.
- **Fetch-agnostic.** Works with React Query, SWR, or raw `fetch`. The library never fetches on its own terms.
- **Typed & tiny.** Written in TypeScript, ships ESM + CJS + `.d.ts`, React is the only peer dependency.

## Install

```sh
npm install react-server-table
# or: pnpm add react-server-table / yarn add react-server-table
```

React 17, 18, or 19 (peer dependency).

## Quick start

```tsx
import { useServerTable } from "react-server-table";

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
        sort: sorting
          .map((s) => `${s.id}:${s.desc ? "desc" : "asc"}`)
          .join(","),
      });
      for (const f of filters) params.append(`filter.${f.id}`, String(f.value));

      const res = await fetch(`/api/users?${params}`, { signal });
      const json = await res.json(); // { rows: User[]; total: number }
      return { rows: json.rows, total: json.total };
    },
  });

  if (table.error) return <p>Failed to load: {table.error.message}</p>;

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={table.isAllRowsSelected}
                ref={(el) => {
                  if (el) el.indeterminate = table.isSomeRowsSelected;
                }}
                onChange={() => table.toggleAllRowsSelected()}
              />
            </th>
            <th onClick={() => table.toggleSort("name")}>
              Name {table.getSort("name") || ""}
            </th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={row.id}>
              <td>
                <input
                  type="checkbox"
                  checked={table.isRowSelected(row, i)}
                  onChange={() => table.toggleRowSelected(row, i)}
                />
              </td>
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

### With React Query

`fetchData` is just an async function, so you can delegate caching to React Query:

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

> Prefer one source of truth: either let `useServerTable` drive fetching via its `fetchData`, or use it purely for state and fetch with React Query keyed off `table.pagination/sorting/filters`.

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

**Sorting** — `sorting`, `setSorting(updater)`, `toggleSort(columnId, { multi? })`, `getSort(columnId)`

**Filtering** — `filters`, `setFilter(columnId, value)` (pass `undefined` to remove), `setFilters(updater)`, `clearFilters()`, `getFilter(columnId)`

**Selection** — `selection`, `isRowSelected(row, i)`, `toggleRowSelected(row, i, value?)`, `toggleAllRowsSelected(value?)`, `clearSelection()`, `selectedRowIds`, `selectedRows`, `isAllRowsSelected`, `isSomeRowsSelected`

### Behavior notes

- **Changing sort or filters resets to page 0** — the standard table UX.
- **Stale responses are dropped.** If requests overlap, only the most recent result is applied; forward the provided `signal` to your `fetch` to also cancel in-flight work.
- **Selection is keyed by `getRowId`** and persists across pages. `selectedRowIds` holds every selected id; `selectedRows` reflects only the currently-loaded page.
- **`selectedRows` / `isAllRowsSelected` describe the current page**, since the hook only holds the rows your fetcher returned for it.

## What this is not (yet)

Row virtualization, column resize/reorder, CSV export, and cursor-based pagination are out of scope for now. See the project backlog.

## License

MIT
