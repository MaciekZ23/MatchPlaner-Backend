/*
  Warnings:

  - A unique constraint covering the columns `[stageId,round,index]` on the table `matches` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."SlotSource" AS ENUM ('TEAM', 'WINNER', 'LOSER');

-- AlterTable
ALTER TABLE "public"."matches" ADD COLUMN     "awaySourceKind" "public"."SlotSource",
ADD COLUMN     "awaySourceRef" TEXT,
ADD COLUMN     "homeSourceKind" "public"."SlotSource",
ADD COLUMN     "homeSourceRef" TEXT,
ADD COLUMN     "index" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "matches_stageId_round_index_key" ON "public"."matches"("stageId", "round", "index");
