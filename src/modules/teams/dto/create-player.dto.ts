import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreatePlayerDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ enum: ['GK', 'DEF', 'MID', 'FWD'] })
  @IsIn(['GK', 'DEF', 'MID', 'FWD'])
  position!: 'GK' | 'DEF' | 'MID' | 'FWD';

  @ApiProperty({ required: false, minimum: 1, maximum: 99 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  shirtNumber?: number;

  @ApiProperty({ enum: ['HEALTHY', 'INJURED'] })
  @IsIn(['HEALTHY', 'INJURED'])
  healthStatus!: 'HEALTHY' | 'INJURED';
}
