-- CreateEnum
CREATE TYPE "public"."MatchStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINISHED');

-- CreateEnum
CREATE TYPE "public"."MatchEventType" AS ENUM ('GOAL', 'ASSIST', 'OWN_GOAL', 'CARD');

-- CreateEnum
CREATE TYPE "public"."CardKind" AS ENUM ('YELLOW', 'RED', 'SECOND_YELLOW');

-- CreateTable
CREATE TABLE "public"."matches" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "groupId" TEXT,
    "round" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "public"."MatchStatus" NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "homeGKIds" TEXT[],
    "awayGKIds" TEXT[],

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."match_events" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "minute" INTEGER NOT NULL,
    "type" "public"."MatchEventType" NOT NULL,
    "playerId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "card" "public"."CardKind",

    CONSTRAINT "match_events_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."matches" ADD CONSTRAINT "matches_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "public"."stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."matches" ADD CONSTRAINT "matches_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."matches" ADD CONSTRAINT "matches_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "public"."Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."matches" ADD CONSTRAINT "matches_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "public"."Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."match_events" ADD CONSTRAINT "match_events_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "public"."matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
