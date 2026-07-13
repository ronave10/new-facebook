/*
  Warnings:

  - You are about to drop the column `email` on the `leads` table. All the data in the column will be lost.
  - You are about to drop the column `fieldData` on the `leads` table. All the data in the column will be lost.
  - You are about to drop the column `fullName` on the `leads` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `leads` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "DataDeletionStatus" AS ENUM ('RECEIVED', 'COMPLETED');

-- AlterTable
ALTER TABLE "leads" DROP COLUMN "email",
DROP COLUMN "fieldData",
DROP COLUMN "fullName",
DROP COLUMN "phone",
ADD COLUMN     "fbUserId" TEXT,
ADD COLUMN     "piiAuthTag" TEXT,
ADD COLUMN     "piiCiphertext" TEXT,
ADD COLUMN     "piiIv" TEXT,
ADD COLUMN     "piiKeyVersion" INTEGER;

-- CreateTable
CREATE TABLE "data_deletion_requests" (
    "id" TEXT NOT NULL,
    "confirmationCode" TEXT NOT NULL,
    "metaUserId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'data_deletion',
    "status" "DataDeletionStatus" NOT NULL DEFAULT 'RECEIVED',
    "leadsDeleted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "data_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_deletion_requests_confirmationCode_key" ON "data_deletion_requests"("confirmationCode");

-- CreateIndex
CREATE INDEX "data_deletion_requests_metaUserId_idx" ON "data_deletion_requests"("metaUserId");

-- CreateIndex
CREATE INDEX "leads_fbUserId_idx" ON "leads"("fbUserId");
