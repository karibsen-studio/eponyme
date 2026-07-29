-- AlterTable
ALTER TABLE "eponyme_entries" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "eponyme_entries_deletedAt_idx" ON "eponyme_entries"("deletedAt");
