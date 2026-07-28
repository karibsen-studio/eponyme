-- CreateTable
CREATE TABLE "eponyme_form_submissions" (
    "id" TEXT NOT NULL,
    "formName" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eponyme_form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eponyme_form_submissions_formName_createdAt_idx" ON "eponyme_form_submissions"("formName", "createdAt");
