# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## 0.1.0 — unreleased

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
