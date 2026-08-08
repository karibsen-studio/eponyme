-- Eponyme keeps its persistence contract version independent from the npm package version.
CREATE TABLE "_eponyme_schema" (
    "key" TEXT NOT NULL DEFAULT 'eponyme',
    "version" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "_eponyme_schema_pkey" PRIMARY KEY ("key")
);

INSERT INTO "_eponyme_schema" ("key", "version", "updatedAt")
VALUES ('eponyme', 1, CURRENT_TIMESTAMP);
