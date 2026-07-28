CREATE TABLE "eponyme_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameNormalized" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eponyme_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "eponyme_user_sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eponyme_user_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "eponyme_users_usernameNormalized_key" ON "eponyme_users"("usernameNormalized");
CREATE INDEX "eponyme_users_role_active_idx" ON "eponyme_users"("role", "active");
CREATE UNIQUE INDEX "eponyme_user_sessions_tokenHash_key" ON "eponyme_user_sessions"("tokenHash");
CREATE INDEX "eponyme_user_sessions_userId_idx" ON "eponyme_user_sessions"("userId");
CREATE INDEX "eponyme_user_sessions_expiresAt_idx" ON "eponyme_user_sessions"("expiresAt");

ALTER TABLE "eponyme_user_sessions"
ADD CONSTRAINT "eponyme_user_sessions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "eponyme_users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
