# V萌猫小筑游戏后端

基于 NestJS 11 的模块化游戏后端，提供账号认证、用户、好友、队伍、房间、聊天、匹配队列和实时连接等通用能力，可作为 Web、微信小游戏或微信小程序的服务端基础。

当前项目是一个模块化单体：所有业务模块运行在同一个 NestJS 进程中，PostgreSQL 保存持久状态，Redis 保存在线连接和匹配索引等临时状态，同时通过 REST API 与 Socket.IO 对外提供服务。

## 功能概览

- 用户注册、账号登录、游客登录、access/refresh token 轮换和退出登录
- 当前用户资料、用户搜索和公开资料查询
- 好友申请、接受申请、好友列表和删除好友
- 队伍创建、成员加入、主动离队和队长移除成员
- 房间创建、房间码加入、准备、开始和离开
- 私聊、队伍聊天、房间聊天和历史消息查询
- 匹配票据创建、状态查询、取消及 Redis 队列索引
- `/platform` 与 `/game` 两个独立 Socket.IO namespace
- HTTP 与 Socket 输入校验、身份认证、限流和统一异常响应
- Swagger、健康检查、同源联调台、Prisma migration 和 seed
- Docker 多阶段构建、开发/生产 Compose 和 Nginx 反向代理配置

## 技术栈

| 分类       | 技术                                       | 用途                                |
| ---------- | ------------------------------------------ | ----------------------------------- |
| 运行环境   | Node.js 22、TypeScript 5                   | 服务端运行和静态类型检查            |
| 应用框架   | NestJS 11、Express                         | 模块化、依赖注入和 HTTP 服务        |
| 持久化     | PostgreSQL 16、Prisma 6                    | 业务数据、事务、schema 和 migration |
| 临时状态   | Redis 7、ioredis                           | 在线连接集合和匹配队列索引          |
| 实时通信   | Socket.IO 4                                | 平台消息和游戏输入转发              |
| 身份安全   | Passport、JWT、bcryptjs                    | Bearer 鉴权、令牌轮换和密码哈希     |
| 输入安全   | class-validator、class-transformer、Helmet | DTO 白名单、类型转换和安全响应头    |
| 流量保护   | @nestjs/throttler、自定义 Socket 限流      | HTTP 和实时事件限流                 |
| 文档与监控 | Swagger、Terminus                          | API 文档和依赖健康检查              |
| 测试       | Jest、Supertest、socket.io-client          | 单元测试和端到端测试                |
| 部署       | Docker、Docker Compose、Nginx              | 构建、编排和公网反向代理            |

## 架构

```mermaid
flowchart LR
	Client[Web / 微信小游戏 / 小程序]
	Nginx[Nginx]
	App[NestJS 应用]
	PostgreSQL[(PostgreSQL)]
	Redis[(Redis)]

	Client -->|REST API| Nginx
	Client <-->|Socket.IO| Nginx
	Nginx --> App
	App --> PostgreSQL
	App --> Redis
```

一次典型 HTTP 请求会依次经过：

```text
客户端 -> HTTP 限流 -> JWT Guard -> DTO ValidationPipe
			-> Controller -> Service -> Prisma/Redis -> 统一响应拦截器
```

- Controller 负责协议适配、读取当前用户和调用 Service。
- DTO 验证所有外部输入，未知字段会被拒绝。
- Service 保存业务规则并通过 Prisma 或 Redis 读写状态。
- Prisma 负责关系数据、事务和并发一致性。
- Redis 负责适合快速访问、允许重建的临时索引。
- 全局异常过滤器和响应拦截器统一 HTTP 返回结构。

## 模块组成

| 模块                | 职责                                 |
| ------------------- | ------------------------------------ |
| `AuthModule`        | 注册、登录、游客登录、令牌刷新和退出 |
| `UsersModule`       | 当前用户资料、用户搜索和公开资料     |
| `FriendsModule`     | 好友申请、接受、列表和删除           |
| `TeamsModule`       | 队伍及成员管理                       |
| `RoomsModule`       | 房间生命周期和成员准备状态           |
| `ChatModule`        | 私聊、队伍/房间消息和历史记录        |
| `MatchmakingModule` | 匹配票据和 Redis 队列索引            |
| `RealtimeModule`    | Socket 鉴权、平台事件和游戏事件      |
| `DatabaseModule`    | Prisma Client 生命周期               |
| `RedisModule`       | ioredis Client 生命周期              |
| `HealthModule`      | PostgreSQL 和 Redis 健康检查         |

## 目录结构

```text
server/
├── src/
│   ├── auth/ users/ friends/ teams/ rooms/
│   ├── chat/ matchmaking/ realtime/ health/
│   ├── common/ config/ database/ redis/
│   ├── app.module.ts
│   ├── configure-app.ts
│   └── main.ts
├── prisma/                  # schema、migration 和 seed
├── test/                    # e2e 测试
├── public/                  # 同源 REST/Socket 联调台
├── deploy/nginx/            # Nginx 示例配置
├── tools/                   # 生产发布脚本
├── Dockerfile
├── docker-compose.yml       # 本地完整环境
└── docker-compose.prod.yml  # 生产环境
```

## 本地运行

宿主机直接开发需要 Node.js 22+、npm 10+、PostgreSQL 16+ 和 Redis 7+。使用完整 Docker Compose 时只需要 Docker Engine 和 Docker Compose v2+。

### 方式一：完整 Docker 环境

这是最简单且不依赖宿主机 PostgreSQL/Redis 的方式：

```bash
cp .env.example .env
# 编辑 .env，至少替换两个长度不小于 32 字符的 JWT 密钥
docker compose up -d --build
docker compose ps
docker compose logs -f app migration
```

停止服务：

```bash
docker compose down
```

普通 `down` 不删除数据卷。只有明确不再需要本地数据时才使用 `docker compose down -v`。

### 方式二：Docker 只运行依赖

```bash
docker compose up -d postgres redis
cp .env.example .env
npm install
```

此模式下 `.env` 必须使用本地 Compose 的实际数据库配置：

```env
DATABASE_URL=postgresql://game:game_dev_password@localhost:5432/vcat_game?schema=public
REDIS_URL=redis://localhost:6379
```

然后初始化并启动应用：

```bash
npm run prisma:generate
npm run prisma:deploy
npm run start:dev
```

### 方式三：全部使用宿主机服务

自行创建 PostgreSQL 数据库和用户，并确保 Redis 已启动。复制 `.env.example` 后，将 `DATABASE_URL` 和 `REDIS_URL` 修改为实际连接地址，再执行安装、Prisma 初始化和 `npm run start:dev`。

默认监听 `http://localhost:3000`：

- 健康检查：`GET /api/health`
- Swagger：`/api/docs`
- 同源 REST/Socket 联调台：`/`

Swagger 和联调台默认在非生产环境开启、生产环境关闭，可分别通过 `SWAGGER_ENABLED` 和 `SERVE_TEST_CONSOLE` 显式控制。

开发数据库需要初始化测试数据时可运行：

```bash
npm run prisma:seed
```

Seed 包含固定开发管理员账号和密码，只能用于本地开发。不要在生产数据库运行 seed；若已运行，应立即修改或删除固定账号。

## 环境配置

以 `.env.example` 为开发模板、`.env.production.example` 为生产模板。应用启动时会校验配置，不合法时直接退出。

关键配置：

| 变量                                       | 说明                                       |
| ------------------------------------------ | ------------------------------------------ |
| `NODE_ENV`                                 | `development`、`test` 或 `production`      |
| `PORT` / `API_PREFIX`                      | HTTP 端口和全局 API 前缀                   |
| `DATABASE_URL` / `REDIS_URL`               | PostgreSQL 和 Redis 连接地址，必填         |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | 两个不同的 JWT 密钥，至少 32 字符          |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL_DAYS`  | access 和 refresh token 有效期             |
| `CORS_ORIGINS`                             | 逗号分隔的可信来源，不应使用通配符         |
| `TRUST_PROXY_HOPS`                         | 可信反向代理跳数；直连时为 `0`             |
| `SERVE_TEST_CONSOLE`                       | 是否提供根路径联调台；生产默认关闭         |
| `SWAGGER_ENABLED`                          | 是否提供 Swagger；生产默认关闭             |
| `HTTP_BODY_LIMIT`                          | JSON 和表单请求体上限                      |
| `HTTP_REQUEST_TIMEOUT_MS`                  | 完整请求超时                               |
| `HTTP_HEADERS_TIMEOUT_MS`                  | 请求头超时，不能大于完整请求超时           |
| `HTTP_KEEP_ALIVE_TIMEOUT_MS`               | Keep-Alive 空闲超时，必须小于请求头超时    |
| `THROTTLE_*`                               | 全局 HTTP 限流窗口和次数                   |
| `AUTH_RATE_*`                              | 认证端点按 IP 和 handler 的限流            |
| `SOCKET_*`                                 | Socket payload、握手、心跳、事件和连接限制 |

部署在 Nginx、Ingress 或负载均衡器后时，应把 `TRUST_PROXY_HOPS` 设置为实际且固定的可信代理跳数，否则客户端可伪造 IP 或所有请求被识别为同一来源。

主要默认值：

| 配置                                                       | 默认值            |
| ---------------------------------------------------------- | ----------------- |
| `PORT` / `API_PREFIX`                                      | `3000` / `api`    |
| `HTTP_BODY_LIMIT`                                          | `100kb`           |
| `HTTP_REQUEST_TIMEOUT_MS`                                  | `60000`           |
| `HTTP_HEADERS_TIMEOUT_MS`                                  | `30000`           |
| `HTTP_KEEP_ALIVE_TIMEOUT_MS`                               | `5000`            |
| `THROTTLE_TTL_MS` / `THROTTLE_LIMIT`                       | `60000` / `120`   |
| `AUTH_RATE_WINDOW_MS` / `AUTH_RATE_LIMIT`                  | `60000` / `10`    |
| `SOCKET_MAX_PAYLOAD_BYTES`                                 | `65536`           |
| `SOCKET_CONNECT_TIMEOUT_MS` / `SOCKET_PING_TIMEOUT_MS`     | `10000` / `20000` |
| `SOCKET_RATE_WINDOW_MS`                                    | `1000`            |
| `SOCKET_EVENT_RATE_LIMIT` / `SOCKET_GAME_INPUT_RATE_LIMIT` | `20` / `30`       |
| `SOCKET_MAX_CONNECTIONS_PER_USER`                          | `5`               |

## HTTP API

所有 HTTP 路由默认需要 Bearer access token，明确标记为公开的认证和健康检查端点除外。请求参数通过 DTO 白名单验证，未知字段会被拒绝。

```http
Authorization: Bearer <accessToken>
```

### 公开接口

| 方法   | 路径                 | 说明                         |
| ------ | -------------------- | ---------------------------- |
| `POST` | `/api/auth/register` | 注册账号                     |
| `POST` | `/api/auth/login`    | 账号密码登录                 |
| `POST` | `/api/auth/guest`    | 创建游客账号并登录           |
| `POST` | `/api/auth/refresh`  | 轮换 refresh token           |
| `GET`  | `/api/health`        | PostgreSQL 和 Redis 健康检查 |

### 认证与用户

| 方法    | 路径                   | 说明                         |
| ------- | ---------------------- | ---------------------------- |
| `POST`  | `/api/auth/logout`     | 撤销请求体中的 refresh token |
| `GET`   | `/api/users/me`        | 当前用户资料                 |
| `PATCH` | `/api/users/me`        | 修改当前用户资料             |
| `GET`   | `/api/users/search?q=` | 搜索用户                     |
| `GET`   | `/api/users/:id`       | 查询用户公开资料             |

### 好友、队伍和房间

| 方法     | 路径                               | 说明                 |
| -------- | ---------------------------------- | -------------------- |
| `GET`    | `/api/friends`                     | 好友及待处理关系列表 |
| `POST`   | `/api/friends/requests`            | 发起好友申请         |
| `POST`   | `/api/friends/requests/:id/accept` | 接受好友申请         |
| `DELETE` | `/api/friends/:id`                 | 删除好友关系         |
| `GET`    | `/api/teams`                       | 查询当前用户的队伍   |
| `POST`   | `/api/teams`                       | 创建队伍             |
| `POST`   | `/api/teams/:id/members`           | 添加成员             |
| `DELETE` | `/api/teams/:id/members/me`        | 主动离队             |
| `DELETE` | `/api/teams/:id/members/:userId`   | 队长移除成员         |
| `POST`   | `/api/rooms`                       | 创建房间             |
| `POST`   | `/api/rooms/join`                  | 通过房间码加入       |
| `GET`    | `/api/rooms/:id`                   | 查询房间和成员       |
| `PUT`    | `/api/rooms/:id/ready`             | 设置当前成员准备状态 |
| `POST`   | `/api/rooms/:id/start`             | 房主开始游戏         |
| `DELETE` | `/api/rooms/:id/members/me`        | 离开或关闭房间       |

### 聊天与匹配

| 方法     | 路径                                          | 说明                     |
| -------- | --------------------------------------------- | ------------------------ |
| `POST`   | `/api/chat/messages`                          | 发送私聊、队伍或房间消息 |
| `GET`    | `/api/chat/messages?scope=&targetId=&before=` | 分页查询历史消息         |
| `POST`   | `/api/matchmaking/queue`                      | 加入匹配队列             |
| `GET`    | `/api/matchmaking/queue`                      | 查询最近匹配票据         |
| `DELETE` | `/api/matchmaking/queue`                      | 取消排队                 |

具体请求字段和约束以 Swagger 及各模块 `dto/` 目录为准。

### HTTP 响应

成功响应：

```json
{
  "success": true,
  "data": {},
  "timestamp": "2026-10-29T00:00:00.000Z"
}
```

失败响应：

```json
{
  "success": false,
  "error": {
    "statusCode": 400,
    "message": "Validation failed"
  },
  "path": "/api/example",
  "timestamp": "2026-10-29T00:00:00.000Z"
}
```

## Socket.IO

Socket.IO 使用两个 namespace：

- `/platform`：在线状态、频道、聊天等平台能力
- `/game`：游戏房间加入和输入广播

连接时通过 `auth.token` 或 `Authorization: Bearer <token>` 提交 access token：

```js
const socket = io('http://localhost:3000/platform', {
  auth: { token: accessToken },
});
```

服务器会验证签名、有效期，并确认数据库中的用户仍为 `ACTIVE`。握手失败通过 `connect_error.data` 返回 `UNAUTHORIZED`、`CONNECTION_LIMIT` 或 `AUTHENTICATION_FAILED`。

### `/platform` 事件

| 方向            | 事件             | 数据/说明                                 |
| --------------- | ---------------- | ----------------------------------------- |
| 客户端 → 服务端 | `channel:join`   | `{ scope, targetId }`，加入队伍或房间频道 |
| 服务端 → 客户端 | `channel:joined` | 加入成功确认                              |
| 客户端 → 服务端 | `chat:send`      | 发送聊天消息，与 HTTP 聊天 DTO 相同       |
| 服务端 → 客户端 | `chat:message`   | 收到新消息                                |
| 服务端 → 客户端 | `chat:sent`      | 返回已保存消息 ID                         |
| 服务端 → 客户端 | `server:error`   | 校验、限流或内部错误                      |

连接建立后会加入 `user:<userId>` Socket 房间、更新 PostgreSQL `lastSeenAt`，并把 socket ID 写入 Redis `online:user:<userId>` 集合，TTL 为 24 小时。

### `/game` 事件

| 方向              | 事件                  | 数据/说明                                    |
| ----------------- | --------------------- | -------------------------------------------- |
| 客户端 → 服务端   | `room:join`           | `{ roomId }`，必须是数据库中的房间成员       |
| 服务端 → 客户端   | `room:joined`         | 加入成功确认                                 |
| 服务端 → 其他成员 | `player:joined`       | 玩家进入实时房间通知                         |
| 客户端 → 服务端   | `game:input`          | `{ roomId, sequence, input }`                |
| 服务端 → 其他成员 | `game:input`          | 转发玩家 ID、序列号和输入                    |
| 服务端 → 客户端   | `game:input:accepted` | 输入接受确认                                 |
| 服务端 → 客户端   | `game:error`          | 未加入、不可玩、观战者输入或旧序列等业务错误 |
| 服务端 → 客户端   | `server:error`        | DTO、限流或内部错误                          |

`game:input.sequence` 必须递增，`input` 序列化后不能超过 4096 字节。房间必须为 `PLAYING`，观战者不能发送输入。当前没有单独的 Socket `room:leave` 事件；断开连接会自动离开 Socket 房间，持久房间成员离开通过 HTTP API 完成。

## 数据模型

| 模型                  | 作用                                     |
| --------------------- | ---------------------------------------- |
| `User`                | 账号、显示资料、角色、状态和最后在线时间 |
| `RefreshToken`        | refresh token 哈希、过期和撤销状态       |
| `Friendship`          | 好友申请双方、状态和无方向唯一 pair key  |
| `Team` / `TeamMember` | 队伍、队长和成员关系                     |
| `Room` / `RoomMember` | 房间、游戏模式、状态、角色和准备状态     |
| `ChatMessage`         | 私聊、队伍、房间和系统消息               |
| `MatchTicket`         | 游戏模式、队列状态和匹配房间关联         |

常用 Prisma 命令：

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:deploy
npm run prisma:seed
npx prisma validate
npx prisma studio
```

## 构建与生产运行

不使用 Docker 时：

```bash
npm ci
npm run prisma:generate
npm run build
npm run prisma:deploy
NODE_ENV=production npm run start:prod
```

生产构建入口是 `dist/src/main.js`。应用已启用优雅退出，在收到进程终止信号时关闭 Nest、Prisma 和 Redis 连接。

## 生产 Docker Compose

创建并编辑生产配置：

```bash
cp .env.production.example .env
```

至少替换 `POSTGRES_PASSWORD`、两个 JWT secret、`CORS_ORIGINS` 和 `TRUST_PROXY_HOPS`。生产 Compose 会把容器内的 `DATABASE_URL` 和 `REDIS_URL` 指向内部服务。

```bash
docker compose --env-file .env -f docker-compose.prod.yml config
docker compose -p vcat-server --env-file .env -f docker-compose.prod.yml up -d --build
docker compose -p vcat-server --env-file .env -f docker-compose.prod.yml ps
docker compose -p vcat-server --env-file .env -f docker-compose.prod.yml logs -f app migration
```

生产服务包括：

- `postgres`：PostgreSQL 16 和持久卷。
- `redis`：Redis 7、AOF 和持久卷。
- `migration`：PostgreSQL 健康后执行 `prisma migrate deploy`，成功后退出。
- `app`：migration 成功且 Redis 健康后启动 NestJS。

应用只绑定宿主机 `127.0.0.1:3000`，PostgreSQL 和 Redis 不暴露宿主机端口，应由 Nginx 或其他可信反向代理对外提供服务。

## Nginx

仓库提供 `deploy/nginx/vcat-server.conf` 示例，包含 HTTP 反向代理和 WebSocket Upgrade。使用前需根据实际域名、IP、日志目录和证书修改配置，并在 Nginx `http` 上下文加入：

```nginx
map $http_upgrade $connection_upgrade {
		default upgrade;
		'' close;
}
```

示例本身不包含 TLS。生产环境应配置 HTTPS 和 HTTP 到 HTTPS 跳转，然后执行：

```bash
nginx -t
systemctl reload nginx
```

## 一键生产部署

`tools/deploy-production.sh` 会在本地执行构建、单测和 e2e，打包并上传代码，在远端临时目录构建镜像，备份旧目录、启动生产 Compose，最后检查本机和公网健康接口。

远端必须预先安装 Docker Compose、配置好 Nginx，并在目标目录保存生产 `.env`。运行示例：

```bash
SERVER_HOST=<服务器地址> \
SERVER_USER=<SSH用户> \
SSH_KEY="$HOME/.ssh/your_private_key" \
REMOTE_APP_DIR=/www/wwwroot/vcat-server \
COMPOSE_PROJECT=vcat-server \
PUBLIC_HEALTH_URL=https://example.com/api/health \
bash tools/deploy-production.sh
```

脚本不会上传本地 `.env`，也不会安装或重载 Nginx。健康检查失败时会保留旧目录备份，但目前不会自动回滚。

## 数据持久化与可视化

Docker 数据保存在 `postgres_data` 和 `redis_data` 命名卷中，实例重启或普通 `docker compose down` 不会删除数据。

- PostgreSQL 可使用 Prisma Studio、DBeaver、TablePlus 或 pgAdmin。
- Redis 可使用 RedisInsight。
- 生产数据库不应直接开放公网 `5432` 或 `6379`，应通过 SSH 隧道、VPN 或堡垒机访问。

## 安全设计

- HTTP 路由默认受全局 JWT Guard 保护，匿名接口必须显式使用 `@Public()`。
- access token 和 refresh token 使用不同密钥。
- 密码使用 bcrypt 哈希，refresh token 只保存 SHA-256 哈希并在刷新时轮换。
- HTTP 和 Socket 输入使用 DTO 白名单验证。
- Helmet、请求体限制、HTTP 限流、Socket 事件限流和连接数限制均已启用。
- 生产 Compose 不对公网暴露 PostgreSQL 和 Redis。
- `.env`、私钥、数据库密码和 JWT secret 不应提交到版本库。

## 当前能力边界

当前项目是游戏后端基础框架，不是完整的权威游戏服务器：

- 匹配模块只创建票据并维护 Redis 索引，没有匹配 worker、自动配对或自动建房。
- `/game` 只验证并转发玩家输入，没有世界状态模拟、帧同步、碰撞、伤害、胜负判定和战绩结算。
- 尚未实现游戏状态快照、断线重连恢复和服务端反作弊。
- Socket.IO 使用默认内存 adapter，Socket 限流和连接数统计也是单进程内存状态。
- 多实例部署前需要接入 Socket.IO Redis adapter，并把限流和连接状态迁移到共享存储。
- Redis 不可用时，匹配票据仍可能写入 PostgreSQL，但不会进入 Redis 队列；在线状态也不会记录。
- 游客账号会持久写入数据库，目前没有自动清理任务。
- 私聊目前不强制要求双方为好友。

## 验证命令

```bash
npm run lint
npm run build
npm test -- --runInBand
npm run test:e2e
npx prisma validate
```

`npm run lint` 会自动修改可修复的问题。e2e 会启动完整 AppModule，需要有效环境变量、PostgreSQL 和 Redis，并会向数据库写入测试用户，不要直接对生产数据库运行。

## 常见问题

### `npm run start:prod` 找不到 `dist/src/main.js`

```bash
npm run build
npm run start:prod
```

### 应用无法连接本地 Docker PostgreSQL

确认 `.env` 使用 `game:game_dev_password@localhost:5432/vcat_game`，然后检查 `docker compose ps` 和 `docker compose logs postgres`。

### Socket.IO 经过 Nginx 无法连接

确认 Nginx 已配置 HTTP/1.1、`Upgrade`、`Connection` 请求头和 `$connection_upgrade` map，并确认 `CORS_ORIGINS` 包含客户端来源。

### 云服务器 Docker 构建资源不足

检查内存、swap、Docker 日志和磁盘空间。低内存实例可配置 swap，或改为在 CI 构建镜像后由服务器拉取。

## License

本项目在 `package.json` 中声明为 `UNLICENSED`，未授权公开复制、分发或再许可。
