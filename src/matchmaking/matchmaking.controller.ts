import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { JoinMatchDto } from './dto/join-match.dto';
import { MatchmakingService } from './matchmaking.service';

@ApiTags('matchmaking')
@ApiBearerAuth()
@Controller('matchmaking')
export class MatchmakingController {
  constructor(private readonly matchmaking: MatchmakingService) {}

  @Post('queue')
  join(@CurrentUser() user: AuthenticatedUser, @Body() dto: JoinMatchDto) {
    return this.matchmaking.join(user.userId, dto.gameMode);
  }

  @Get('queue')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.matchmaking.status(user.userId);
  }

  @Delete('queue')
  cancel(@CurrentUser() user: AuthenticatedUser) {
    return this.matchmaking.cancel(user.userId);
  }
}
