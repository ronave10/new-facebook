-- CreateEnum
CREATE TYPE "AbTestStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'RUNNING', 'CONCLUDED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "ApprovalEntityType" ADD VALUE 'AB_TEST';

-- CreateTable
CREATE TABLE "ab_tests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hypothesis" TEXT,
    "metric" TEXT NOT NULL DEFAULT 'CVR',
    "status" "AbTestStatus" NOT NULL DEFAULT 'DRAFT',
    "level" "SnapshotLevel" NOT NULL DEFAULT 'AD',
    "cellAId" TEXT NOT NULL,
    "cellALabel" TEXT NOT NULL,
    "cellBId" TEXT NOT NULL,
    "cellBLabel" TEXT NOT NULL,
    "metaTestId" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "result" JSONB,
    "winnerCellId" TEXT,
    "createdById" TEXT,
    "launchedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ab_tests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ab_tests_organizationId_clientId_idx" ON "ab_tests"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "ab_tests_organizationId_campaignId_idx" ON "ab_tests"("organizationId", "campaignId");

-- AddForeignKey
ALTER TABLE "ab_tests" ADD CONSTRAINT "ab_tests_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
