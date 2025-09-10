-- CreateEnum
CREATE TYPE "public"."TournamentMode" AS ENUM ('LEAGUE', 'KNOCKOUT', 'LEAGUE_PLAYOFFS');

-- CreateEnum
CREATE TYPE "public"."StageKind" AS ENUM ('GROUP', 'PLAYOFF');

-- CreateTable
CREATE TABLE "public"."tournaments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "public"."TournamentMode" NOT NULL,
    "description" TEXT,
    "additionalInfo" TEXT,
    "season" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "timezone" TEXT,
    "venue" TEXT,
    "venueAddress" TEXT,
    "venueImageUrl" TEXT,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teamIds" TEXT[],
    "tournamentId" TEXT NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."stages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "public"."StageKind" NOT NULL,
    "order" INTEGER NOT NULL,
    "tournamentId" TEXT NOT NULL,

    CONSTRAINT "stages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."groups" ADD CONSTRAINT "groups_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stages" ADD CONSTRAINT "stages_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
