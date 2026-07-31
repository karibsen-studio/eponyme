-- CreateTable
CREATE TABLE "eponyme_entry_index" (
    "entryName" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "eponyme_entry_index_pkey" PRIMARY KEY ("entryName","version","key","value")
);

-- CreateIndex
CREATE INDEX "eponyme_entry_index_key_version_value_idx" ON "eponyme_entry_index"("key", "version", "value");

-- AddForeignKey
ALTER TABLE "eponyme_entry_index" ADD CONSTRAINT "eponyme_entry_index_entryName_fkey" FOREIGN KEY ("entryName") REFERENCES "eponyme_entries"("name") ON DELETE CASCADE ON UPDATE CASCADE;
