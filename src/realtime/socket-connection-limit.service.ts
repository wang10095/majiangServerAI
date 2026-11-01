import { Injectable } from '@nestjs/common';

@Injectable()
export class SocketConnectionLimitService {
  private readonly connections = new Map<string, Set<string>>();

  acquire(userId: string, socketId: string, limit: number): boolean {
    const sockets = this.connections.get(userId) ?? new Set<string>();
    if (sockets.size >= limit) return false;
    sockets.add(socketId);
    this.connections.set(userId, sockets);
    return true;
  }

  release(userId: string, socketId: string): void {
    const sockets = this.connections.get(userId);
    if (!sockets) return;
    sockets.delete(socketId);
    if (sockets.size === 0) this.connections.delete(userId);
  }
}
