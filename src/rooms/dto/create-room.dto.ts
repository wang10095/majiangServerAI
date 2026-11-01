import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';

export class CreateRoomDto {
  @ApiProperty()
  @IsString()
  @Length(1, 40)
  name!: string;

  @ApiProperty({ example: 'classic' })
  @IsString()
  @Length(1, 32)
  gameMode!: string;

  @ApiProperty({ minimum: 2, maximum: 16, default: 4 })
  @IsInt()
  @Min(2)
  @Max(16)
  maxPlayers = 4;
}
