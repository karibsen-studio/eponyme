CREATE TABLE "eponyme_versions" (
    "id" SERIAL NOT NULL,
    "entryName" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eponyme_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "eponyme_versions_entryName_createdAt_idx" ON "eponyme_versions"("entryName", "createdAt");

ALTER TABLE "eponyme_versions"
ADD CONSTRAINT "eponyme_versions_entryName_fkey"
FOREIGN KEY ("entryName") REFERENCES "eponyme_entries"("name")
ON DELETE CASCADE ON UPDATE CASCADE;
