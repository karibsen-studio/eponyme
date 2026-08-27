-- Moves draft, published, status and publishedAt out of the `data` JSONB envelope into real
-- columns. What this buys: `publishedAt IS NOT NULL` becomes a SQL predicate, so a listing can
-- filter, order and paginate published entries in the database instead of loading the whole
-- collection into memory; and a public listing selects `published` alone, so draft content is
-- never read at all.
--
-- Irreversible. Take an export (`GET /api/eponyme-export`) before applying it.

-- AlterTable
ALTER TABLE "eponyme_entries"
    ADD COLUMN "draft"       JSONB,
    ADD COLUMN "published"   JSONB,
    ADD COLUMN "status"      TEXT,
    ADD COLUMN "publishedAt" TIMESTAMP(3);

-- Backfill.
--
-- Three shapes exist on disk. The current `__eponyme` envelope; the legacy `__keditor` one,
-- which was never migrated because a read converts it lazily; and a bare payload from before
-- the envelope existed, which the application treats as content for both draft and published.
-- The COALESCE chain handles all three, and its defaults ('published', NULL) reproduce exactly
-- what `createState` builds for the bare case.
--
-- `publishedAt` is cast behind a shape test: the application only ever checked that it was a
-- string, so one malformed value would otherwise abort the whole migration. A published entry
-- whose date is unusable falls back to `updatedAt` rather than to NULL – losing the date is a
-- detail, silently unpublishing the entry is not.
UPDATE "eponyme_entries" AS e
SET "draft"     = COALESCE(v.env->'draft', e."data"),
    "published" = COALESCE(v.env->'published', e."data"),
    "status"    = CASE WHEN v.env->>'status' = 'draft' THEN 'draft' ELSE 'published' END,
    "publishedAt" = CASE
        WHEN v.env->>'publishedAt' ~ '^\d{4}-\d{2}-\d{2}' THEN (v.env->>'publishedAt')::timestamptz
        WHEN v.env->>'publishedAt' IS NOT NULL THEN e."updatedAt"
        ELSE NULL
    END
FROM (
    SELECT "name", COALESCE("data"->'__eponyme', "data"->'__keditor', '{}'::jsonb) AS env
    FROM "eponyme_entries"
) AS v
WHERE v."name" = e."name";

-- Every row now has content: a payload that was neither envelope nor object still produced
-- `'{}'`, which reconciliation fills with the schema defaults on first read.
ALTER TABLE "eponyme_entries"
    ALTER COLUMN "draft" SET NOT NULL,
    ALTER COLUMN "published" SET NOT NULL,
    ALTER COLUMN "status" SET NOT NULL;

-- DropColumn
-- Not kept as a dormant copy: writes would stop maintaining it, and a half-rolled-back
-- deployment reading stale content and serving it confidently is worse than failing loudly.
ALTER TABLE "eponyme_entries" DROP COLUMN "data";

-- CreateIndex
CREATE INDEX "eponyme_entries_publishedAt_idx" ON "eponyme_entries"("publishedAt");

-- A collection listing matches on `name LIKE 'articles/%'`. Under a non-C collation the
-- primary key index cannot serve that, so the pagination this migration unlocks would still
-- read the whole table.
CREATE INDEX "eponyme_entries_name_pattern_idx" ON "eponyme_entries" ("name" text_pattern_ops);
