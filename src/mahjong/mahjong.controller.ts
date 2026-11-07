import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { MahjongService } from './mahjong.service';

interface MahjongCommandBody {
  requestId?: string;
  action: string;
  tile?: number;
  tiles?: number[];
  clientSeq?: number;
}

@Controller('mahjong')
export class MahjongController {
  constructor(private readonly games: MahjongService) {}

  @Post('single')
  async startSingle(@CurrentUser() user: AuthenticatedUser) {
    const state = await this.games.createSinglePlayerGame(user.userId);
    return this.games.projectState(state.gameId, user.userId);
  }

  @Get('single/:gameId')
  async snapshot(@CurrentUser() user: AuthenticatedUser, @Param('gameId') gameId: string) {
    await this.games.restoreGame(gameId, user.userId);
    return this.games.projectState(gameId, user.userId);
  }

  @Post('single/:gameId/command')
  async command(
    @CurrentUser() user: AuthenticatedUser,
    @Param('gameId') gameId: string,
    @Body() body: MahjongCommandBody,
  ) {
    const result = await this.games.applyCommand(
      user.userId,
      gameId,
      body.requestId ?? `${Date.now()}-${Math.random()}`,
      body.action,
      body.tile,
      body.tiles ?? [],
      body.clientSeq ?? 0,
    );
    return {
      ...result.result,
      snapshot: this.games.projectState(gameId, user.userId),
    };
  }
}