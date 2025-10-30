import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class GenerateRoundRobinDto {
  @ApiProperty({ example: '2025-08-17' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ example: ['14:00', '16:00', '18:00'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  matchTimes?: string[];

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @Min(1)
  @ValidateIf((o) => o.roundInSingleDay === false)
  @IsDefined()
  dayInterval?: number;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  doubleRound?: boolean;

  @ApiPropertyOptional({ example: ['G1', 'G2'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  groupIds?: string[];
  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  clearExisting?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  shuffleTeams?: boolean;

  @ApiPropertyOptional({ example: 120 })
  @IsInt()
  @Min(1)
  @IsOptional()
  matchIntervalMinutes?: number;

  @ApiPropertyOptional({ example: '10:00' })
  @IsString()
  @IsOptional()
  firstMatchTime?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  roundInSingleDay?: boolean;
}
