/*
  Warnings:

  - Made the column `criadoPorId` on table `requests` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "requests" DROP CONSTRAINT "requests_criadoPorId_fkey";

-- AlterTable
ALTER TABLE "requests" ALTER COLUMN "criadoPorId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
