import { ChatScope } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class ChatHistoryQueryDto {
  @IsEnum(ChatScope)
  scope!: ChatScope;

  @IsString()
  targetId!: string;

  @IsOptional()
  @IsDateString()
  before?: string;
}
