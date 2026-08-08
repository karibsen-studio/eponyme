CREATE TABLE "eponyme_rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eponyme_rate_limits_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "eponyme_rate_limits_expiresAt_idx" ON "eponyme_rate_limits"("expiresAt");

UPDATE "_eponyme_schema"
SET "version" = 2,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'eponyme';
