-- CreateEnum
CREATE TYPE "public"."VotingStatus" AS ENUM ('NOT_STARTED', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."VotingClosePolicyType" AS ENUM ('ABSOLUTE_DEADLINE', 'NEXT_ROUND_START', 'MANUAL');

-- CreateTable
CREATE TABLE "public"."Voting" (
    "matchId" TEXT NOT NULL,
    "status" "public"."VotingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "closeType" "public"."VotingClosePolicyType",
    "closesAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voting_pkey" PRIMARY KEY ("matchId")
);

-- CreateTable
CREATE TABLE "public"."MVPVoteSummary" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "votes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MVPVoteSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MVPVoteSummary_matchId_playerId_key" ON "public"."MVPVoteSummary"("matchId", "playerId");

-- AddForeignKey
ALTER TABLE "public"."Voting" ADD CONSTRAINT "Voting_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "public"."matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MVPVoteSummary" ADD CONSTRAINT "MVPVoteSummary_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "public"."Voting"("matchId") ON DELETE CASCADE ON UPDATE CASCADE;
