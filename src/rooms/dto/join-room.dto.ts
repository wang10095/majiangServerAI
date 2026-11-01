import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class JoinRoomDto {
  @ApiProperty()
  @IsString()
  @Length(6, 6)
  code!: string;
}
