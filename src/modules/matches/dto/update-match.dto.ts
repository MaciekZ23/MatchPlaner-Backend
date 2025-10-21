import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MatchEventInput, MatchEventUpdateInput } from './match-event.input';

export class UpdateMatchDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  stageId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  groupId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  round?: number | null;

  @ApiPropertyOptional()
  @ValidateIf((o) => !o.groupId && o.index !== undefined)
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  index?: number | null;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({ enum: ['SCHEDULED', 'LIVE', 'FINISHED'] as const })
  @IsEnum(['SCHEDULED', 'LIVE', 'FINISHED'])
  @IsOptional()
  status?: 'SCHEDULED' | 'LIVE' | 'FINISHED';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  homeTeamId?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  awayTeamId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  score?: { home: number | null; away: number | null } | null;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  homeGKIds?: string[] | null;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  awayGKIds?: string[] | null;

  @ApiPropertyOptional({ type: [MatchEventUpdateInput] })
  @ValidateNested({ each: true })
  @Type(() => MatchEventUpdateInput)
  @IsOptional()
  eventsUpdate?: MatchEventUpdateInput[];

  @ApiPropertyOptional({ type: [MatchEventInput] })
  @ValidateNested({ each: true })
  @Type(() => MatchEventInput)
  @IsOptional()
  eventsAppend?: MatchEventInput[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  eventsDelete?: string[];
}
