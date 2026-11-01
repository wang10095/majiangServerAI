import { IsString } from 'class-validator';

export class JoinGameRoomDto {
  @IsString()
  roomId!: string;
}
