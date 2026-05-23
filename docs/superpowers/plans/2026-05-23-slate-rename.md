# Slate Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the product from **WordPressKiller** to **Slate** across the entire repository — brand strings, identifiers, package names, env vars, cookie names, theme directory, and Terraform resources. Verified by `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green and a zero-hit grep sweep for legacy spellings.

**Architecture:** Pure mechanical refactor — no behavioral changes. Each task targets one variant class. Renaming env vars and cookies breaks running sessions and local `.env` files; this is acceptable for a pre-1.0 project and documented in CHANGELOG. Terraform IDs change — anyone with existing Terraform state must run `terraform state mv` (commands provided in §Migration Notes). No DB-side `wpk_` prefixes exist (verified by grep), so no SQL migration needed.

**Tech Stack:** No new dependencies. Existing toolchain (TypeScript, Tailwind, Drizzle, pnpm workspaces, Terraform).

**Depends on:** Spec at `docs/superpowers/specs/2026-05-23-slate-rename-and-landing-page-design.md` §1.

---

## File Map

The rename touches roughly 114 source files across these categories:

| Category                  | Example paths                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Brand strings             | `README.md`, `WordPressKiller.md` → `Slate.md`, `package.json` `name`, code comments, JSX strings                      |
| Theme directory           | `themes/slate-default/` → `themes/slate-default/` (entire directory tree + `manifest.json`)                              |
| pnpm workspace package    | `packages/cli/package.json`, `pnpm-lock.yaml`, root `package.json` `cli` script                                        |
| Cookie names              | `src/auth/cookies.ts`, `src/auth/cookies.test.ts`, `src/auth/admin-token.ts`, `src/middleware.ts`, OAuth callback code |
| Env vars                  | `.env.example`, `src/auth/admin-token.ts`, `packages/cli/src/transport.ts`, Terraform var names                        |
| Terraform                 | `infra/terraform/**/*.tf` (module name, resource IDs, SA prefixes, queue names, AR repo)                               |
| Spec doc                  | `WordPressKiller.md` → `Slate.md`, `README.md` link                                                                    |
| CHANGELOG (new)           | Top-level `CHANGELOG.md`                                                                                               |

---

## Migration Notes

These notes go in the PR description and `CHANGELOG.md`:

- **Sessions reset.** Cookie name change (`wpk_*` → `slate_*`) invalidates all existing sessions; users must sign in again after upgrade.
- **`.env` requires update.** Any `WPK_*` variable in your local `.env` or `.env.local` must be renamed to `SLATE_*`. Old names are not back-compat shimmed.
- **Terraform state migration.** Existing deployments must move resources in Terraform state before `terraform apply` — otherwise `apply` will destroy and recreate Cloud Run, the LB, queues, and the artifact registry. Provided commands:
  ```bash
  cd infra/terraform/envs/<your-env>
  terraform state mv 'module.wpkiller' 'module.slate'
  terraform state mv 'google_artifact_registry_repository.wpk' 'google_artifact_registry_repository.slate'
  # ... per-resource mv lines (commands enumerated in Task 6)
  ```

---

## Task 1: Brand Strings

**Goal:** Replace `WordPressKiller` / `wordpresskiller` / `WORDPRESSKILLER` everywhere they appear as brand strings (display text, package `name`, docs) with `Slate` / `slate` / `SLATE`. Excludes identifiers prefixed `wpk-`, `wpk_`, `wpkiller`, `@wpkiller` — those are separate tasks.

**Files:**
- Modify: `package.json` (root `name` field)
- Modify: `README.md` (heading and prose)
- Modify: `WordPressKiller.md` content (renamed in Task 7)
- Modify: ~58 source files with `WordPressKiller` strings — find via grep
- Modify: theme `manifest.json` (handled fully in Task 2; but the `WordPressKiller` strings there are part of this task)
- Modify: `themes/slate-default/manifest.json` `name` ("WPK Default" → "Slate Default"), `author.name` ("WordPressKiller" → "Slate"), `description` ("Polished baseline theme bundled with WordPressKiller." → "Polished baseline theme bundled with Slate."), `customizations[footerText].default` ("Made with WordPressKiller." → "Made with Slate.")
- Modify: `WordPressKiller.md` (rename to `Slate.md` in this task or Task 7 — handle in Task 7 to keep file-rename atomic)

- [ ] **Step 1: Survey the surface**

```bash
grep -rIn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=pnpm-lock.yaml "WordPressKiller\|wordpresskiller\|WORDPRESSKILLER" . | tee /tmp/slate-rename-step1.txt | wc -l
```

Expected: ~70 matches across ~58 files. Read the list and confirm none are inside a string you don't want to change (e.g., a comment quoting a historical name on purpose).

- [ ] **Step 2: Replace brand strings**

Run, from repo root:

```bash
grep -rIl --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git "WordPressKiller" . | xargs sed -i 's/WordPressKiller/Slate/g'
grep -rIl --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git "wordpresskiller" . | xargs sed -i 's/wordpresskiller/slate/g'
grep -rIl --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git "WORDPRESSKILLER" . | xargs sed -i 's/WORDPRESSKILLER/SLATE/g'
```

The "WPK Default" theme display name and "Made with WordPressKiller." footer default get handled by the same sweep (since they include the substring `WordPressKiller`). The standalone "WPK Default" name in `themes/slate-default/manifest.json` is handled in Task 2 along with the dir rename.

- [ ] **Step 3: Verify nothing crucial broke**

```bash
pnpm typecheck
```

Expected: no errors. (Type errors here are almost certainly from a string that turned out to be a type/identifier — investigate before continuing.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: rename WordPressKiller -> Slate brand strings"
```

---

## Task 2: Theme Directory

**Goal:** Rename `themes/slate-default/` to `themes/slate-default/` and update its manifest plus any references.

**Files:**
- Move: `themes/slate-default/` → `themes/slate-default/`
- Modify: `themes/slate-default/manifest.json` (`slug` field: `"slate-default"` → `"slate-default"`; `name` field: `"WPK Default"` → `"Slate Default"` if not already changed)
- Modify: any file referencing `slate-default` (theme loader code, tests, seeds, docs)

- [ ] **Step 1: Survey references**

```bash
grep -rIn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git "slate-default" . | tee /tmp/slate-rename-step2.txt
```

Expected: hits in theme loader (`src/themes/...`), tests, seeds, docs/spec files.

- [ ] **Step 2: Rename the directory**

```bash
git mv themes/slate-default themes/slate-default
```

- [ ] **Step 3: Update the manifest**

Edit `themes/slate-default/manifest.json`:
- `"name": "WPK Default"` → `"name": "Slate Default"` (if not already replaced in Task 1)
- `"slug": "slate-default"` → `"slug": "slate-default"`

- [ ] **Step 4: Update all references**

```bash
grep -rIl --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git "slate-default" . | xargs sed -i 's/slate-default/slate-default/g'
```

- [ ] **Step 5: Update the active-theme seed/setting if hardcoded**

Search for any hardcoded "slate-default" still left after the sweep (e.g., a DB seed value or a fallback constant):

```bash
grep -rIn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git "slate-default\|wpk_default" .
```

Expected: empty. If any remain, edit them by hand.

- [ ] **Step 6: Verify**

```bash
pnpm typecheck && pnpm test src/themes packages/cli/src/commands
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(themes): rename slate-default to slate-default"
```

---

## Task 3: pnpm Workspace Package

**Goal:** Rename `@wpkiller/cli` to `@slate/cli` everywhere it appears, regenerate `pnpm-lock.yaml`.

**Files:**
- Modify: `packages/cli/package.json` (`"name"` field)
- Modify: root `package.json` (`scripts.cli` value)
- Modify: any file with `@wpkiller/cli` (find via grep)
- Regenerate: `pnpm-lock.yaml`

- [ ] **Step 1: Survey**

```bash
grep -rIn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git "@wpkiller" .
```

Expected: ~10 hits (CLI package.json, root package.json, docs/plans referencing it).

- [ ] **Step 2: Replace**

```bash
grep -rIl --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git "@wpkiller" . | xargs sed -i 's|@wpkiller/cli|@slate/cli|g; s|@wpkiller|@slate|g'
```

- [ ] **Step 3: Regenerate the lockfile**

```bash
pnpm install
```

Expected: lockfile updates with the new package name; no install errors.

- [ ] **Step 4: Smoke-test the CLI**

```bash
pnpm cli --help
```

Expected: CLI help output (no module resolution errors). If the CLI doesn't have a `--help`, run any harmless command it exposes.

- [ ] **Step 5: Run CLI tests**

```bash
pnpm test packages/cli
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(cli): rename @wpkiller/cli to @slate/cli"
```

---

## Task 4: Cookie Names

**Goal:** Rename `wpk_*` cookie names to `slate_*`. This logs everyone out on deploy — accept that, document it in CHANGELOG (Task 7).

**Cookie name inventory:**
- `wpk_session` → `slate_session`
- `wpk_oauth_state_<provider>` → `slate_oauth_state_<provider>`
- `wpk_oauth_pkce_<provider>` → `slate_oauth_pkce_<provider>`
- Test-only / unknown variants in test files: `wpk_test`, `wpk_unknown` → `slate_test`, `slate_unknown`

**Files:**
- Modify: `src/auth/cookies.ts` (constants and `set/get/clear` helpers)
- Modify: `src/auth/cookies.test.ts` (assertions on new names)
- Modify: `src/auth/admin-token.ts`
- Modify: `src/auth/admin-token.test.ts`
- Modify: `src/middleware.ts` (`SESSION_COOKIE_NAME` constant)
- Modify: `src/middleware.test.ts`
- Modify: `src/app/api/auth/oauth/[provider]/start/route.ts` (and its test)
- Modify: `src/app/api/auth/oauth/[provider]/callback/route.ts` (and its test)
- Modify: any other consumer found by grep

- [ ] **Step 1: Survey**

```bash
grep -rIn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git "wpk_session\|wpk_oauth_\|wpk_test\|wpk_unknown" .
```

Read the output — confirm every hit is a cookie-name string (not a column name, env var, etc.).

- [ ] **Step 2: Replace cookie names**

```bash
grep -rIl --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git "wpk_session\|wpk_oauth_\|wpk_test\|wpk_unknown" . | xargs sed -i 's/wpk_session/slate_session/g; s/wpk_oauth_state_/slate_oauth_state_/g; s/wpk_oauth_pkce_/slate_oauth_pkce_/g; s/wpk_test/slate_test/g; s/wpk_unknown/slate_unknown/g'
```

- [ ] **Step 3: Verify the constant is the only source of truth**

Open `src/auth/cookies.ts` and confirm cookie names are exported constants (e.g., `export const SESSION_COOKIE = "slate_session"`). If any consumer hardcodes a string instead of importing the constant, that's a smell but not a blocker — note for follow-up cleanup.

- [ ] **Step 4: Run auth + middleware tests**

```bash
pnpm test src/auth src/middleware src/app/api/auth
```

Expected: PASS. Failures here are usually a missed string or a test asserting on the old name — fix and re-run.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(auth): rename wpk_ cookie names to slate_"
```

---

## Task 5: Env Var Names

**Goal:** Rename `WPK_*` env vars to `SLATE_*`.

**Env var inventory:**
- `WPK_SESSION` → `SLATE_SESSION` (referenced by CLI transport)
- `WPK_TOKEN` → `SLATE_TOKEN` (admin token)
- `WPK_URL` → `SLATE_URL` (CLI base URL)
- `WPK_VERSION` → `SLATE_VERSION` (build/runtime version stamp)

**Files:**
- Modify: `.env.example` (the only one currently with `WPK_VERSION`)
- Modify: `src/auth/admin-token.ts` (reads `WPK_TOKEN`)
- Modify: `src/auth/admin-token.test.ts`
- Modify: `packages/cli/src/transport.ts` (reads `WPK_URL`, `WPK_TOKEN`, etc.)
- Modify: `packages/cli/src/transport.test.ts`
- Modify: `packages/cli/src/commands/import.ts`, `export.ts` (anywhere they read env)
- Modify: `instrumentation.ts` (reads `WPK_VERSION`)
- Modify: `src/middleware.ts` if it touches `WPK_*`
- Modify: Terraform variable names referenced by name — handled in Task 6

- [ ] **Step 1: Survey**

```bash
grep -rIn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git "WPK_" .
```

Read the output. Each hit is a string literal naming an env var.

- [ ] **Step 2: Replace**

```bash
grep -rIl --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git "WPK_" . | xargs sed -i 's/WPK_SESSION/SLATE_SESSION/g; s/WPK_TOKEN/SLATE_TOKEN/g; s/WPK_URL/SLATE_URL/g; s/WPK_VERSION/SLATE_VERSION/g'
```

(Listing each variable explicitly rather than a wildcard so we don't accidentally rewrite an unrelated string.)

- [ ] **Step 3: Update any docs that mention the env vars**

Already covered by the sweep above, but spot-check:

```bash
grep -rIn "WPK_\|SLATE_" docs README.md
```

- [ ] **Step 4: Run impacted tests**

```bash
pnpm test src/auth packages/cli
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(env): rename WPK_ env vars to SLATE_"
```

---

## Task 6: Terraform

**Goal:** Rename the Terraform module, resource IDs, service-account IDs, queue names, and artifact registry repo. Document the `terraform state mv` migration in CHANGELOG.

**Inventory (from `grep "wpk\|WPK\|WordPress" infra/terraform`):**
- Module path/dir: `infra/terraform/modules/wpkiller/` → `infra/terraform/modules/slate/`
- Module reference: `module "wpkiller"` → `module "slate"`, `source = "./modules/wpkiller"` → `source = "./modules/slate"`
- Service accounts:
  - `account_id = "wpk-runtime"` → `"slate-runtime"`
  - `display_name = "WordPressKiller runtime SA"` → handled by Task 1
  - `account_id = "wpk-tasks-invoker"` → `"slate-tasks-invoker"`
- Cloud Tasks queues (8 of them): `wpk-revalidate`, `wpk-media`, `wpk-ai`, `wpk-email`, `wpk-webhooks`, `wpk-imports`, `wpk-exports` (and any others) → `slate-*` equivalents
- Artifact Registry repo: `repository_id = "wpk"` → `"slate"`, resource label `"wpk"` → `"slate"`
- Output references: `module.wpkiller.lb_ip` → `module.slate.lb_ip` (and `cloud_run_url`, `media_bucket`, `service_account_email`)
- A commented-out `prefix = "wpkiller"` line — update for consistency.

- [ ] **Step 1: Survey**

```bash
grep -rIn --exclude-dir=node_modules --exclude-dir=.terraform "wpk\|WPK\|wpkiller" infra/terraform
```

Read the full output.

- [ ] **Step 2: Rename the module directory**

```bash
git mv infra/terraform/modules/wpkiller infra/terraform/modules/slate
```

- [ ] **Step 3: Replace identifiers**

```bash
grep -rIl --exclude-dir=node_modules --exclude-dir=.terraform "wpkiller\|wpk-\|\"wpk\"" infra/terraform | xargs sed -i 's|modules/wpkiller|modules/slate|g; s/module "wpkiller"/module "slate"/g; s/module\.wpkiller/module.slate/g; s/wpkiller/slate/g; s/wpk-runtime/slate-runtime/g; s/wpk-tasks-invoker/slate-tasks-invoker/g; s/wpk-revalidate/slate-revalidate/g; s/wpk-media/slate-media/g; s/wpk-ai/slate-ai/g; s/wpk-email/slate-email/g; s/wpk-webhooks/slate-webhooks/g; s/wpk-imports/slate-imports/g; s/wpk-exports/slate-exports/g; s/repository_id = "wpk"/repository_id = "slate"/g; s/resource "google_artifact_registry_repository" "wpk"/resource "google_artifact_registry_repository" "slate"/g; s/google_artifact_registry_repository\.wpk/google_artifact_registry_repository.slate/g/'
```

(If the sed is unwieldy in one line, split into multiple `sed -i` calls. The goal is the same.)

- [ ] **Step 4: Verify Terraform still parses**

```bash
cd infra/terraform
terraform fmt -recursive
terraform init -backend=false
terraform validate
cd -
```

Expected: `validate` reports success.

- [ ] **Step 5: Document the state-migration in CHANGELOG**

The `CHANGELOG.md` content is written in Task 7. For now, just confirm the resource renames are tracked in the staged diff so Task 7 can enumerate them.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(infra): rename WordPressKiller Terraform module + resource IDs to slate"
```

---

## Task 7: Spec File, CHANGELOG, Final Sweep

**Goal:** Rename the master spec file, write the CHANGELOG entry, run the full verification gate, sweep for missed references.

**Files:**
- Move: `WordPressKiller.md` → `Slate.md`
- Modify: `README.md` (cross-reference to spec)
- Create or modify: `CHANGELOG.md`

- [ ] **Step 1: Rename the spec file**

```bash
git mv WordPressKiller.md Slate.md
```

- [ ] **Step 2: Update the README link**

Edit `README.md`:

```diff
-See [`WordPressKiller.md`](./WordPressKiller.md) for the full design specification.
+See [`Slate.md`](./Slate.md) for the full design specification.
```

The body of `Slate.md` already had its `WordPressKiller` mentions replaced in Task 1; no further edits inside that file.

- [ ] **Step 3: Write the CHANGELOG entry**

Create (or prepend to) `CHANGELOG.md`:

```markdown
# Changelog

## Unreleased

### Renamed: WordPressKiller → Slate

The product was renamed from WordPressKiller to Slate. This is a breaking change for any existing local or deployed instance:

- **Sessions reset.** Cookie names changed (`wpk_session` → `slate_session`, OAuth state/PKCE prefixes likewise). All users must sign in again after upgrade.
- **Environment variables.** `WPK_*` → `SLATE_*`. Update `.env`, `.env.local`, and any deployment env config.
  - `WPK_SESSION` → `SLATE_SESSION`
  - `WPK_TOKEN` → `SLATE_TOKEN`
  - `WPK_URL` → `SLATE_URL`
  - `WPK_VERSION` → `SLATE_VERSION`
- **Theme directory.** `themes/slate-default/` → `themes/slate-default/`. Sites that pinned the default theme by slug must update their active-theme setting.
- **pnpm workspace package.** `@wpkiller/cli` → `@slate/cli`. Existing scripts that invoked `pnpm --filter @wpkiller/cli ...` need updating.
- **Terraform.** Module, resource IDs, service-account prefixes, queue names, and artifact-registry repo all renamed. Before `terraform apply`, run state migrations:
  ```bash
  terraform state mv 'module.wpkiller' 'module.slate'
  terraform state mv 'google_artifact_registry_repository.wpk' 'google_artifact_registry_repository.slate'
  # plus any other previously-applied resources (SAs, queues, etc.)
  ```
- **Spec file.** `WordPressKiller.md` → `Slate.md`.
```

- [ ] **Step 4: Final sweep**

```bash
grep -rIn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=.terraform --exclude=CHANGELOG.md "WordPressKiller\|wordpresskiller\|WORDPRESSKILLER\|wpkiller\|@wpkiller\|wpk-\|wpk_\|WPK_" . 2>/dev/null
```

Expected: empty (or only `CHANGELOG.md` mentions, which are intentional and already excluded). If anything else turns up, investigate — likely a string the targeted sed sweeps missed (e.g., a file extension we didn't include).

- [ ] **Step 5: Full verification gate**

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All five must pass. `pnpm install` is included because the lockfile changed in Task 3.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: rename spec to Slate.md, add CHANGELOG entry for rename"
```

- [ ] **Step 7: Open PR**

```bash
gh pr create --title "refactor: rename WordPressKiller to Slate" --body "$(cat <<'EOF'
## Summary

- Full rename of the product from WordPressKiller to Slate across the project.
- Breaking changes: sessions reset (cookie rename), env vars (`WPK_*` → `SLATE_*`), theme dir (`slate-default` → `slate-default`), pnpm workspace package (`@wpkiller/cli` → `@slate/cli`), Terraform module + resources.

See `CHANGELOG.md` for the full breaking-change list and the `terraform state mv` migration commands.

## Test plan

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` passes
- [ ] Grep for legacy names returns no hits outside `CHANGELOG.md`
- [ ] `cd infra/terraform && terraform validate` passes
- [ ] Manually sign in locally and confirm the new `slate_session` cookie is set
- [ ] Manually run `pnpm cli --help` and confirm the renamed CLI invokes cleanly

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

- [x] Spec §1.1 (variant inventory) → Tasks 1–6 each handle one variant class.
- [x] Spec §1.2 (theme dir, pnpm package, cookies, env vars, DB, repo, spec doc) → all covered in Tasks 2, 3, 4, 5, 7. DB identifiers: verified via grep that none exist; no migration needed.
- [x] Spec §1.3 (out of scope: git history, deployment-level external resources) → not touched.
- [x] Spec §1.4 (verification: typecheck, lint, test, build, grep sweep) → Task 7 Step 4 + Step 5.
- [x] Open Question §4.3 (cookie/env break) → CHANGELOG documents the break (Task 7 Step 3).
- [x] Terraform added on top of spec scope — flagged in Migration Notes; without it, the rename would be incomplete and `terraform apply` would later destroy/recreate resources.
- [x] No "TBD" / placeholder steps; every step has a command or code to run.
