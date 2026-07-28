-- CreateTable
CREATE TABLE "karibsen_editors" (
    "editor" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "karibsen_editors_pkey" PRIMARY KEY ("editor")
);
