import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class LoginDto {
  @ApiProperty()
  @IsString()
  @Length(3, 32)
  username!: string;

  @ApiProperty()
  @IsString()
  @Length(8, 72)
  password!: string;
}
