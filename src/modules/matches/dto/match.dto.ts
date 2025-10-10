import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MatchEventDto {
  @ApiProperty() id!: string;
  @ApiProperty() minute!: number;
  @ApiProperty({ enum: ['GOAL', 'ASSIST', 'OWN_GOAL', 'CARD'] })
  type!: 'GOAL' | 'ASSIST' | 'OWN_GOAL' | 'CARD';
  @ApiProperty() playerId!: string;
  @ApiProperty() teamId!: string;
  @ApiPropertyOptional({ enum: ['YELLOW', 'RED', 'SECOND_YELLOW'] })
  card?: 'YELLOW' | 'RED' | 'SECOND_YELLOW';
}

export class MatchDto {
  @ApiProperty() id!: string;
  @ApiProperty() stageId!: string;
  @ApiPropertyOptional() groupId?: string;
  @ApiPropertyOptional() round?: number;
  @ApiPropertyOptional() index?: number;
  @ApiProperty() date!: string;
  @ApiProperty({ enum: ['SCHEDULED', 'LIVE', 'FINISHED'] })
  status!: 'SCHEDULED' | 'LIVE' | 'FINISHED';
  @ApiProperty({ nullable: true, type: String })
  homeTeamId!: string | null;
  @ApiProperty({ nullable: true, type: String })
  awayTeamId!: string | null;
  @ApiProperty({ enum: ['TEAM', 'WINNER', 'LOSER'], nullable: true })
  homeSourceKind!: 'TEAM' | 'WINNER' | 'LOSER' | null;
  @ApiProperty({ nullable: true, type: String })
  homeSourceRef!: string | null;
  @ApiProperty({ enum: ['TEAM', 'WINNER', 'LOSER'], nullable: true })
  awaySourceKind!: 'TEAM' | 'WINNER' | 'LOSER' | null;
  @ApiProperty({ nullable: true, type: String })
  awaySourceRef!: string | null;
  @ApiPropertyOptional() score?: { home: number; away: number };
  @ApiPropertyOptional({ type: [MatchEventDto] }) events?: MatchEventDto[];
  @ApiPropertyOptional({
    type: 'object',
    properties: {
      homeGKIds: { type: 'array', items: { type: 'string' } },
      awayGKIds: { type: 'array', items: { type: 'string' } },
    },
  })
  lineups?: {
    homeGKIds?: string[];
    awayGKIds?: string[];
  };
}
