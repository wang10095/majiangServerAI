import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { ChatScope } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ enum: ChatScope })
  @IsEnum(ChatScope)
  scope!: ChatScope;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiProperty()
  @Transform(({ value }: TransformFnParams): unknown => {
    const input = value as unknown;
    return typeof input === 'string' ? input.trim() : input;
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 500)
  content!: string;
}
