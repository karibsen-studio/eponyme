-- DropIndex
-- `IF EXISTS` because a database baselined from an older Eponyme install never had this
-- index: it was introduced by the migration that split the content columns, and an
-- application that created its tables another way reaches this point without it.
DROP INDEX IF EXISTS "eponyme_entries_name_pattern_idx";
