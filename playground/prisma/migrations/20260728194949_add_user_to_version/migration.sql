-- AlterTable
ALTER TABLE "eponyme_versions" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "eponyme_versions_userId_idx" ON "eponyme_versions"("userId");

-- AddForeignKey
ALTER TABLE "eponyme_versions" ADD CONSTRAINT "eponyme_versions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "eponyme_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
