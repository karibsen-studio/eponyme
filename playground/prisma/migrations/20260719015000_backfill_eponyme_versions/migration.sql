INSERT INTO "eponyme_versions" ("entryName", "data", "action", "status")
SELECT
    entry."name",
    entry."data",
    CASE
        WHEN entry."data"->'__eponyme'->>'status' = 'draft' THEN 'draft'
        ELSE 'publish'
    END,
    CASE
        WHEN entry."data"->'__eponyme'->>'status' = 'draft' THEN 'draft'
        ELSE 'published'
    END
FROM "eponyme_entries" AS entry
WHERE NOT EXISTS (
    SELECT 1
    FROM "eponyme_versions" AS version
    WHERE version."entryName" = entry."name"
);
