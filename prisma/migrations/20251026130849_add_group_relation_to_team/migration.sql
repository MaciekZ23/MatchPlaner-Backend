/*
  Warnings:

  - You are about to drop the column `teamIds` on the `groups` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Team" ADD COLUMN     "groupId" TEXT;

-- AlterTable
ALTER TABLE "public"."groups" DROP COLUMN "teamIds";

-- AddForeignKey
ALTER TABLE "public"."Team" ADD CONSTRAINT "Team_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
