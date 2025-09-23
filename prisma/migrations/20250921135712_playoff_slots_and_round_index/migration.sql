-- DropForeignKey
ALTER TABLE "public"."matches" DROP CONSTRAINT "matches_awayTeamId_fkey";

-- DropForeignKey
ALTER TABLE "public"."matches" DROP CONSTRAINT "matches_homeTeamId_fkey";

-- AlterTable
ALTER TABLE "public"."matches" ALTER COLUMN "homeTeamId" DROP NOT NULL,
ALTER COLUMN "awayTeamId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."matches" ADD CONSTRAINT "matches_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "public"."Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."matches" ADD CONSTRAINT "matches_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "public"."Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
