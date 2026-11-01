import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetReadyDto {
  @ApiProperty()
  @IsBoolean()
  ready!: boolean;
}
