import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { ChatService } from './chat.service';
import { ChatHistoryQueryDto } from './dto/chat-history-query.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post('messages')
  send(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendMessageDto) {
    return this.chat.send(user.userId, dto);
  }

  @Get('messages')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ChatHistoryQueryDto,
  ) {
    return this.chat.history(
      user.userId,
      query.scope,
      query.targetId,
      query.before,
    );
  }
}
