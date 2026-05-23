# Drizzle migration metadata

Drizzle's snapshot chain (`_journal.json` + `*_snapshot.json`) drives
`pnpm db:generate`'s diff engine. **All files in this directory MUST be
committed alongside the SQL migration they correspond to** — they used to
be `.gitignore`d, which broke the chain after migration 0009 and forced
several plans to hand-write SQL instead of regenerating it.

## Current state

- `0000_snapshot.json` … `0009_snapshot.json` — chained and accurate.
- `0010_snapshot.json` … `0012_snapshot.json` — **MISSING**. These snapshots
  were never written because `meta/` was ignored when the corresponding
  migrations landed. The SQL migrations themselves are applied and correct;
  only drizzle's internal snapshot history has gaps.
- `0013_snapshot.json` — reconstructed via `drizzle-kit pull` from the live
  DB, with `prevId` patched to chain off `0009_snapshot.json`'s `id`.

  Two caveats with this snapshot:

  1. `drizzle-kit pull` does NOT pick up Postgres `GENERATED` columns
     (`posts.search_vector_tsv`, `pages.search_vector`) or some manually-added
     foreign keys (`pages.translation_of_fk`, `posts.translation_of_fk`).
     The next `db:generate` will emit a diff trying to **drop** these and
     re-create the surrounding indexes. **Delete those statements by hand
     in the generated SQL** before committing — they would silently destroy
     full-text search.
  2. Index ordering / constraint naming may differ in cosmetic ways from
     what a clean snapshot would have produced. Treat the first
     post-reconstruction `db:generate` as "may need careful editing."

## Adding a new migration

```bash
set -a && source .env.local && set +a
pnpm db:generate
# Inspect src/db/migrations/<new>.sql. Remove any spurious drops of the
# search_vector_tsv / search_vector / translation_of_fk machinery that
# drizzle's introspection blind-spots emit. Then:
pnpm db:migrate
git add src/db/schema.ts src/db/migrations/<new>.sql src/db/migrations/meta/
git commit -m "feat(db): <summary>"
```

If you ever need a perfectly clean chain again, the right path is to:
1. Drop the local DB.
2. Apply all migrations 0000–0013 in order.
3. For each migration, snapshot the schema after applying it (drizzle has
   no first-class command for this — you'd run `db:generate` against an
   intermediate state and capture the resulting snapshot, then advance).

That's significant work; the partial chain above is good enough for new
migrations to land cleanly with one round of hand-editing.
