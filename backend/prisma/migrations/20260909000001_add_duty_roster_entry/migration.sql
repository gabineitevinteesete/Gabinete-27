-- CreateEnum
CREATE TYPE "LocalEscala" AS ENUM ('GABINETE', 'RUA');

-- CreateTable
CREATE TABLE "duty_roster_entries" (
    "id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "userId" TEXT NOT NULL,
    "local" "LocalEscala" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "duty_roster_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "duty_roster_entries_data_userId_key" ON "duty_roster_entries"("data", "userId");

-- CreateIndex
CREATE INDEX "duty_roster_entries_data_idx" ON "duty_roster_entries"("data");

-- AddForeignKey
ALTER TABLE "duty_roster_entries" ADD CONSTRAINT "duty_roster_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
