import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class MatchEventInput {
  @ApiProperty()
  @IsInt()
  @Min(0)
  minute!: number;

  @ApiProperty({ enum: ['GOAL', 'ASSIST', 'OWN_GOAL', 'CARD'] as const })
  @IsEnum(['GOAL', 'ASSIST', 'OWN_GOAL', 'CARD'])
  type!: 'GOAL' | 'ASSIST' | 'OWN_GOAL' | 'CARD';

  @ApiProperty()
  @IsString()
  playerId!: string;

  @ApiProperty()
  @IsString()
  teamId!: string;

  @ApiPropertyOptional({ enum: ['YELLOW', 'RED', 'SECOND_YELLOW'] as const })
  @ValidateIf((o: MatchEventInput) => o.type === 'CARD')
  @IsEnum(['YELLOW', 'RED', 'SECOND_YELLOW'])
  @IsOptional()
  card?: 'YELLOW' | 'RED' | 'SECOND_YELLOW';
}

export class MatchEventUpdateInput extends MatchEventInput {
  @ApiProperty()
  @IsString()
  id!: string;
}
