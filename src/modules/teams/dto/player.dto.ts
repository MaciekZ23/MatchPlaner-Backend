import { ApiProperty } from '@nestjs/swagger';

export class PlayerDto {
  @ApiProperty() id!: string;
  @ApiProperty() teamId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['GK', 'DEF', 'MID', 'FWD'] }) position!:
    | 'GK'
    | 'DEF'
    | 'MID'
    | 'FWD';
  @ApiProperty({ required: false }) shirtNumber?: number;
  @ApiProperty({ enum: ['HEALTHY', 'INJURED'] }) healthStatus!:
    | 'HEALTHY'
    | 'INJURED';
}
