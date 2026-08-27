CREATE TABLE "eponyme_audit_events" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "actorUsername" TEXT,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceName" TEXT,
    "targetUserId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,

    CONSTRAINT "eponyme_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "eponyme_maintenance_state" (
    "key" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eponyme_maintenance_state_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "eponyme_audit_events_occurredAt_idx" ON "eponyme_audit_events"("occurredAt");
CREATE INDEX "eponyme_audit_events_actorUserId_occurredAt_idx" ON "eponyme_audit_events"("actorUserId", "occurredAt");
CREATE INDEX "eponyme_audit_events_action_occurredAt_idx" ON "eponyme_audit_events"("action", "occurredAt");
CREATE INDEX "eponyme_audit_events_resourceType_resourceName_occurredAt_idx" ON "eponyme_audit_events"("resourceType", "resourceName", "occurredAt");

ALTER TABLE "eponyme_audit_events"
ADD CONSTRAINT "eponyme_audit_events_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "eponyme_users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "_eponyme_schema"
SET "version" = 3,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'eponyme';
