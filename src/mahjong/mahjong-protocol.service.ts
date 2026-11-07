import { Injectable } from '@nestjs/common';
import protobuf from 'protobufjs';

const PROTOCOL_VERSION = 1;
const PROTOCOL_DEFINITION = `
syntax = "proto3";
package mahjong;
enum MessageType { MESSAGE_UNKNOWN = 0; COMMAND = 1; EVENT = 2; ERROR = 3; SNAPSHOT_REQUEST = 4; SNAPSHOT = 5; }
enum ActionType { ACTION_UNKNOWN = 0; START_SINGLE_GAME = 1; DISCARD = 2; CHI = 3; PENG = 4; MING_GANG = 5; AN_GANG = 6; BU_GANG = 7; HU = 8; PASS = 9; }
message Envelope {
  uint32 protocol_version = 1; MessageType message_type = 2; string game_id = 3; string request_id = 4;
  uint64 client_seq = 5; uint64 event_seq = 6; uint64 state_version = 7; uint64 ack_event_seq = 8;
  oneof payload { MahjongCommand command = 20; MahjongEvent event = 21; MahjongError error = 22; SnapshotRequest snapshot_request = 23; GameSnapshot snapshot = 24; }
}
message MahjongCommand { ActionType type = 1; int32 tile = 2; repeated int32 tiles = 3; }
message MahjongEvent { string name = 1; bool success = 2; string code = 3; string message = 4; int32 actor_seat = 5; int32 next_operate_seat = 6; }
message MahjongError { string code = 1; string message = 2; }
message SnapshotRequest { uint64 last_event_seq = 1; }
message GameSnapshot { string game_id = 1; uint64 event_seq = 2; uint64 state_version = 3; int32 current_seat = 4; int32 dealer_seat = 5; uint32 wall_remaining = 6; repeated PlayerSnapshot players = 7; }
message PlayerSnapshot { int32 seat = 1; bool bot = 2; repeated int32 hand = 3; uint32 hand_count = 4; repeated int32 discards = 5; bool listening = 6; repeated int32 waiting_tiles = 7; }
`;

export interface DecodedCommand {
  gameId: string;
  requestId: string;
  clientSeq: number;
  type: string;
  tile?: number;
  tiles: number[];
}

export interface DecodedSnapshotRequest {
  gameId: string;
  lastEventSeq: number;
}

@Injectable()
export class MahjongProtocolService {
  private readonly envelope = protobuf
    .parse(PROTOCOL_DEFINITION)
    .root.lookupType('mahjong.Envelope');

  decodeCommand(buffer: Buffer): DecodedCommand {
    const message = this.envelope.decode(buffer) as protobuf.Message & Record<string, unknown>;
    const command = message.command as Record<string, unknown> | undefined;
    if (!command) throw new Error('COMMAND_REQUIRED');
    const actionNames = [
      'ACTION_UNKNOWN',
      'START_SINGLE_GAME',
      'DISCARD',
      'CHI',
      'PENG',
      'MING_GANG',
      'AN_GANG',
      'BU_GANG',
      'HU',
      'PASS',
    ];
    const rawType = command.type;
    const type = typeof rawType === 'number' ? actionNames[rawType] ?? 'ACTION_UNKNOWN' : String(rawType ?? 'ACTION_UNKNOWN');
    return {
      gameId: String(message.gameId ?? ''),
      requestId: String(message.requestId ?? ''),
      clientSeq: Number(message.clientSeq ?? 0),
      type,
      tile: command.tile === undefined ? undefined : Number(command.tile),
      tiles: Array.isArray(command.tiles) ? command.tiles.map(Number) : [],
    };
  }

  decodeSnapshotRequest(buffer: Buffer): DecodedSnapshotRequest {
    const message = this.envelope.decode(buffer) as protobuf.Message & Record<string, unknown>;
    const request = message.snapshotRequest as Record<string, unknown> | undefined;
    if (!request) throw new Error('SNAPSHOT_REQUEST_REQUIRED');
    return {
      gameId: String(message.gameId ?? ''),
      lastEventSeq: Number(request.lastEventSeq ?? 0),
    };
  }

  encodeEvent(event: Record<string, unknown>): Buffer {
    const payload = {
      protocolVersion: PROTOCOL_VERSION,
      messageType: 'EVENT',
      gameId: String(event.gameId ?? ''),
      eventSeq: Number(event.eventSeq ?? 0),
      stateVersion: Number(event.stateVersion ?? 0),
      event: {
        name: String(event.name ?? ''),
        success: Boolean(event.success),
        code: String(event.code ?? ''),
        message: String(event.message ?? ''),
        actorSeat: Number(event.actorSeat ?? -1),
        nextOperateSeat: Number(event.nextOperateSeat ?? -1),
      },
    };
    return Buffer.from(this.envelope.encode(this.envelope.create(payload)).finish());
  }

  encodeSnapshot(snapshot: Record<string, unknown>): Buffer {
    return Buffer.from(
      this.envelope
        .encode(
          this.envelope.create({
            protocolVersion: PROTOCOL_VERSION,
            messageType: 'SNAPSHOT',
            gameId: snapshot.gameId,
            eventSeq: snapshot.eventSeq,
            stateVersion: snapshot.stateVersion,
            snapshot: snapshot.snapshot,
          }),
        )
        .finish(),
    );
  }
}
