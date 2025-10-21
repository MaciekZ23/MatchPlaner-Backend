import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import { Transform, Type } from 'class-transformer';
import { MatchEventInput } from './match-event.input';

export class CreateMatchDto {
  @ApiProperty()
  @IsString()
  stageId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : String(value)))
  @IsString()
  groupId?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  round?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @ValidateIf((o) => !o.groupId && o.index !== undefined)
  @IsInt()
  @Min(1)
  index?: number;

  @ApiProperty({ example: new Date().toISOString() })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ enum: ['SCHEDULED', 'LIVE', 'FINISHED'] as const })
  @IsEnum(['SCHEDULED', 'LIVE', 'FINISHED'])
  @IsOptional()
  status?: 'SCHEDULED' | 'LIVE' | 'FINISHED';

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : String(value)))
  @IsString()
  homeTeamId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : String(value)))
  @IsString()
  awayTeamId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  score?: { home: number; away: number };

  @ApiPropertyOptional({ type: [String], description: 'Bramkarze gospodarzy' })
  @IsArray()
  @IsOptional()
  homeGKIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Bramkarze gości' })
  @IsArray()
  @IsOptional()
  awayGKIds?: string[];

  @ApiPropertyOptional({ type: [MatchEventInput] })
  @ValidateNested({ each: true })
  @Type(() => MatchEventInput)
  @IsOptional()
  events?: MatchEventInput[];
}
