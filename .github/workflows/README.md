# CI/CD workflows

`react-server-table` is published to **npm** as `@muhammad-umairali/react-server-table`.
There is no cloud UAT/PROD deployment.

| Workflow      | Trigger                        | Does                                                       |
| ------------- | ------------------------------ | --------------------------------------------------------- |
| `ci.yml`      | Pull request into `main`/`develop` | Runs the pre-commit hooks (lint/format/hygiene).      |
| `publish.yml` | A **GitHub Release** is published | Rebuilds + tests, verifies the tag matches `package.json`, and `npm publish`es with provenance. |

## Cutting a release

1. **One-time:** create an npm **Automation** token and add it as the repository
   secret **`NPM_TOKEN`** (Settings → Secrets and variables → Actions).
2. Bump `version` in `package.json` via a PR into `develop`, then promote
   `develop` → `main` (Git Flow release).
3. On `main`, publish a **GitHub Release** whose tag is `v<version>` (e.g. `v0.1.0`).
4. `publish.yml` runs and publishes `@muhammad-umairali/react-server-table@<version>`.

The publish job fails fast if the release tag doesn't match `package.json`'s
`version`, so a mistagged release never publishes the wrong number.

See `docs/methodology/06-git-flow-and-environments.md` for the branch flow.
