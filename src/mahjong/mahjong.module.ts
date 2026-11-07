import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { DatabaseModule } from '../database/database.module';
import { MahjongGateway } from './mahjong.gateway';
import { MahjongController } from './mahjong.controller';
import { MahjongProtocolService } from './mahjong-protocol.service';
import { MahjongService } from './mahjong.service';

@Module({
  imports: [RealtimeModule, DatabaseModule],
  controllers: [MahjongController],
  providers: [MahjongGateway, MahjongProtocolService, MahjongService],
  exports: [MahjongService],
})
export class MahjongModule {}
