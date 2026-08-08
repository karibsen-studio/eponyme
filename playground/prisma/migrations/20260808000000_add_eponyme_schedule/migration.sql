-- AlterTable
ALTER TABLE "eponyme_entries"
ADD COLUMN "scheduledPublishAt" TIMESTAMP(3),
ADD COLUMN "scheduledUnpublishAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "eponyme_entries_scheduledPublishAt_idx" ON "eponyme_entries"("scheduledPublishAt");

-- CreateIndex
CREATE INDEX "eponyme_entries_scheduledUnpublishAt_idx" ON "eponyme_entries"("scheduledUnpublishAt");
