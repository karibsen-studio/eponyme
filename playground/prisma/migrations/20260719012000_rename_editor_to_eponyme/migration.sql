-- Rename the pre-release Editor storage without dropping existing content.
ALTER TABLE "karibsen_editors" RENAME TO "eponyme_entries";
ALTER TABLE "eponyme_entries" RENAME COLUMN "editor" TO "name";
ALTER TABLE "eponyme_entries" RENAME CONSTRAINT "karibsen_editors_pkey" TO "eponyme_entries_pkey";
