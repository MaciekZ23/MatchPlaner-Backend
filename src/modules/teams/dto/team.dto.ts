import { ApiProperty } from '@nestjs/swagger';

export class TeamDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ required: false }) logo?: string;
  @ApiProperty({ required: false }) groupId?: string | null;
  @ApiProperty({ type: [String] }) playerIds!: string[];
}
