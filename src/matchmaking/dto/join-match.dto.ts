import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class JoinMatchDto {
  @ApiProperty()
  @IsString()
  @Length(1, 32)
  gameMode!: string;
}
