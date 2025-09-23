import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
} from 'class-validator';

export class GeneratePlayoffsDto {
  @IsDateString()
  startDateISO!: string;

  @IsInt()
  @IsPositive()
  matchDurationMin = 40;

  @IsInt()
  @IsPositive()
  gapBetweenMatchesMin = 5;

  @IsInt()
  @IsPositive()
  matchesPerDay = 1;

  @IsBoolean()
  withThirdPlace = true;

  @IsOptional()
  stageName?: string;
}
