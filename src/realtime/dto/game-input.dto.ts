import { IsInt, IsObject, IsString, Min } from 'class-validator';

export class GameInputDto {
  @IsString()
  roomId!: string;

  @IsInt()
  @Min(0)
  sequence!: number;

  @IsObject()
  input!: Record<string, unknown>;
}
