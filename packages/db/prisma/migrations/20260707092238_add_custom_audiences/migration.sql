-- CreateEnum
CREATE TYPE "CustomAudienceSubtype" AS ENUM ('WEBSITE', 'ENGAGEMENT', 'CUSTOM', 'LOOKALIKE');

-- CreateTable
CREATE TABLE "meta_custom_audiences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "connectionId" TEXT NOT NULL,
    "metaAudienceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtype" "CustomAudienceSubtype" NOT NULL,
    "description" TEXT,
    "approximateCount" INTEGER,
    "originAudienceId" TEXT,
    "ratio" DOUBLE PRECISION,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_custom_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meta_custom_audiences_organizationId_clientId_idx" ON "meta_custom_audiences"("organizationId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_custom_audiences_connectionId_metaAudienceId_key" ON "meta_custom_audiences"("connectionId", "metaAudienceId");

-- AddForeignKey
ALTER TABLE "meta_custom_audiences" ADD CONSTRAINT "meta_custom_audiences_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "meta_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
