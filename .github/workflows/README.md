# CI/CD workflows

`react-server-table` is published as an **npm package** — there is no cloud UAT/PROD
deployment. Under Git Flow, the promotion path maps to the npm registry as follows:

| Trigger | Branch | Intended action |
| ------- | ------ | --------------- |
| Pull request → `develop` | `develop` | `ci.yml` — install, lint, test, build (already present). |
| Push to `release/*` | `release/*` | Publish a **prerelease** to npm (`npm publish --tag next`) or run `npm publish --dry-run` for verification before cutting the release. |
| Push to `main` (tagged release) | `main` | Publish the **stable** version to npm (`npm publish --tag latest`), typically gated on a version tag (`v*`). |

## What the adopter fills in

- Add a `publish.yml` workflow triggered on release tags / `main` that runs
  `npm publish` with an `NPM_TOKEN` repository secret and `permissions: { contents: read, id-token: write }` for npm provenance.
- Decide whether `release/*` publishes a `next`-tagged prerelease or only dry-runs.
- Keep the build/test gate (`ci.yml`) as the required status check on both `develop` and `main`.

See `docs/methodology/06-git-flow-and-environments.md` for the release/hotfix branch flow.
