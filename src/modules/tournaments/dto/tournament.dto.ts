import { ApiProperty } from '@nestjs/swagger';

export class GroupDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class StageDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class TournamentDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: [GroupDto] })
  groups: GroupDto[];

  @ApiProperty({ type: [StageDto] })
  stages: StageDto[];
}
