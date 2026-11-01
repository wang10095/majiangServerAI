import { ChatScope } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class JoinChannelDto {
  @IsEnum(ChatScope)
  scope!: ChatScope;

  @IsString()
  targetId!: string;
}
