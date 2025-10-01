import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export const TournamentModeValues = [
  'LEAGUE',
  'KNOCKOUT',
  'LEAGUE_PLAYOFFS',
] as const;
export type TournamentMode = (typeof TournamentModeValues)[number];

export const StageKindValues = ['GROUP', 'PLAYOFF'] as const;
export type StageKind = (typeof StageKindValues)[number];

export class GroupDto {
  @ApiProperty() @IsString() id!: string;
  @ApiProperty() @IsString() name!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  teamIds!: string[];
}

export class StageDto {
  @ApiProperty() @IsString() id!: string;
  @ApiProperty() @IsString() name!: string;

  @ApiProperty({ enum: StageKindValues })
  @IsIn(StageKindValues)
  kind!: StageKind;

  @ApiProperty()
  @IsNumber()
  order!: number;
}

export class TournamentDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;

  @ApiPropertyOptional({ enum: TournamentModeValues }) mode?: TournamentMode;
  @ApiPropertyOptional() description?: string | null;
  @ApiPropertyOptional() additionalInfo?: string | null;
  @ApiPropertyOptional() season?: string | null;

  @ApiPropertyOptional() startDate?: string | null;
  @ApiPropertyOptional() endDate?: string | null;
  @ApiPropertyOptional() timezone?: string | null;

  @ApiPropertyOptional() venue?: string | null;
  @ApiPropertyOptional() venueAddress?: string | null;
  @ApiPropertyOptional() venueImageUrl?: string | null;

  @ApiProperty({ type: [GroupDto] }) groups!: GroupDto[];
  @ApiProperty({ type: [StageDto] }) stages!: StageDto[];
}

export class CreateTournamentDto {
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;

  @ApiProperty({ enum: TournamentModeValues })
  @IsIn(TournamentModeValues)
  mode!: TournamentMode;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() additionalInfo?:
    | string
    | null;
  @ApiPropertyOptional() @IsOptional() @IsString() season?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?:
    | string
    | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() venue?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() venueAddress?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() venueImageUrl?:
    | string
    | null;

  @ApiPropertyOptional({ type: [GroupDto] })
  @IsOptional()
  @IsArray()
  groups?: GroupDto[];

  @ApiPropertyOptional({ type: [StageDto] })
  @IsOptional()
  @IsArray()
  stages?: StageDto[];
}

export class UpdateTournamentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;

  @ApiPropertyOptional({ enum: TournamentModeValues })
  @IsOptional()
  @IsIn(TournamentModeValues)
  mode?: TournamentMode;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() additionalInfo?:
    | string
    | null;
  @ApiPropertyOptional() @IsOptional() @IsString() season?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?:
    | string
    | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() venue?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() venueAddress?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() venueImageUrl?:
    | string
    | null;
}
