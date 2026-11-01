import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AddTeamMemberDto {
  @ApiProperty()
  @IsString()
  userId!: string;
}
