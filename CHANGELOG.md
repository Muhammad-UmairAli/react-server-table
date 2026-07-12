# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## 0.2.0 — unreleased

### Added

- `useCursorTable` — a headless hook for **cursor-paginated** tables. Supports
  both a **paged** view (`rows`, `nextPage`/`previousPage`, `canNextPage`/`canPreviousPage`)
  and an **infinite** view (`allRows`, `loadMore`, `hasMore`, `reset`) over a shared
  loaded-page cache. Fetcher contract:
  `fetchData({ cursor, limit, sorting, filters }, { signal }) => { rows, nextCursor }`.
  Sorting, filtering, and selection mirror `useServerTable`; selection spans all
  loaded rows. Stale-response handling via request id + `AbortController`.

### Changed

- Internal: shared the sort/filter/selection reducers (`cycleSort`, `upsertFilter`,
  `setRowSelected`, `setRowsSelected`) between both hooks. No behavior change to
  `useServerTable`.

## 0.1.0

Initial public release.

### Added

- `useServerTable` — a headless React hook for server-driven data tables:
  - server-side **pagination** (`nextPage`/`previousPage`/`setPageIndex`/`setPageSize`, `pageCount`, `canNextPage`/`canPreviousPage`),
  - server-side **sorting** (`toggleSort` with single/multi-column, `getSort`),
  - server-side **filtering** (`setFilter`/`setFilters`/`clearFilters`/`getFilter`),
  - client-side **row selection** keyed by `getRowId`, persisted across pages.
- Fetch-agnostic contract: you supply `fetchData({ pagination, sorting, filters }, { signal }) => { rows, total }`.
- Stale-response handling via a monotonic request id and `AbortController`.
- Full TypeScript types; ships ESM + CJS + `.d.ts`.
