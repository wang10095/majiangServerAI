import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class GuestLoginDto {
  @ApiPropertyOptional({ example: '游客' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  displayName?: string;
}
