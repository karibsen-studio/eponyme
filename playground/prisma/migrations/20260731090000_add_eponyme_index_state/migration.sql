-- CreateTable
-- No backfill: an absent row means "never indexed", which is the condition that makes the
-- next boot rebuild the collection. Seeding it would claim an index that does not exist yet.
CREATE TABLE "eponyme_index_state" (
    "name" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eponyme_index_state_pkey" PRIMARY KEY ("name")
);
