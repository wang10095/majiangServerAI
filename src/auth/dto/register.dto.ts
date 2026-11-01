import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'player001' })
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_]+$/)
  username!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @Length(8, 72)
  password!: string;

  @ApiProperty({ example: '萌猫玩家' })
  @IsString()
  @Length(1, 32)
  displayName!: string;
}
