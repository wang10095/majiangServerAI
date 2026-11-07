import protobuf from 'protobufjs';

const AUTH_PROTOCOL_DEFINITION = `
syntax = "proto3";
package auth;
message AuthRequest {
  string username = 1;
  string password = 2;
  string display_name = 3;
}
message AuthUser {
  string id = 1;
  string username = 2;
  string display_name = 3;
  string role = 4;
  string status = 5;
}
message AuthResponse {
  bool success = 1;
  string access_token = 2;
  string refresh_token = 3;
  string error = 4;
  AuthUser user = 5;
  string timestamp = 6;
}
`;

export interface AuthRequestData {
  username: string;
  password: string;
  displayName?: string;
}

export interface AuthResponseData {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
  user?: {
    id: string;
    username: string;
    displayName: string;
    role: string;
    status: string;
  };
  timestamp: string;
}

export class AuthProtocol {
  private readonly requestType = protobuf
    .parse(AUTH_PROTOCOL_DEFINITION)
    .root.lookupType('auth.AuthRequest');
  private readonly responseType = protobuf
    .parse(AUTH_PROTOCOL_DEFINITION)
    .root.lookupType('auth.AuthResponse');

  decodeRequest(buffer: Buffer): AuthRequestData {
    const message = this.requestType.decode(buffer) as protobuf.Message & Record<string, unknown>;
    return {
      username: String(message.username ?? ''),
      password: String(message.password ?? ''),
      displayName: message.displayName ? String(message.displayName) : undefined,
    };
  }

  encodeResponse(response: AuthResponseData): Buffer {
    return Buffer.from(
      this.responseType
        .encode(
          this.responseType.create({
            success: response.success,
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            error: response.error,
            timestamp: response.timestamp,
            user: response.user,
          }),
        )
        .finish(),
    );
  }
}