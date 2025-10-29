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

export class GeneratePlayoffsDto {
  @ApiPropertyOptional({})
  @IsString()
  @IsOptional()
  stageName?: string;

  @ApiProperty({})
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ example: ['14:00', '16:00', '18:00'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  matchTimes?: string[];

  @ApiPropertyOptional({})
  @ValidateIf((o) => !o.matchTimes || o.matchTimes.length === 0)
  @IsString()
  @IsDefined()
  firstMatchTime?: string;

  @ApiPropertyOptional({})
  @ValidateIf((o) => !o.matchTimes || o.matchTimes.length === 0)
  @IsInt()
  @Min(1)
  @IsDefined()
  matchIntervalMinutes?: number;

  @ApiPropertyOptional({ example: 7 })
  @ValidateIf((o) => o.roundInSingleDay === false)
  @IsInt()
  @Min(1)
  @IsDefined()
  dayInterval?: number;

  @ApiPropertyOptional({})
  @IsBoolean()
  @IsOptional()
  roundInSingleDay?: boolean;

  @ApiPropertyOptional({})
  @IsBoolean()
  @IsOptional()
  withThirdPlace?: boolean;

  @ApiPropertyOptional({})
  @IsBoolean()
  @IsOptional()
  clearExisting?: boolean;
}
