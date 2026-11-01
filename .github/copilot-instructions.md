# Project Instructions

- Build a NestJS 11 modular game backend using TypeScript strict mode.
- Use PostgreSQL through Prisma for durable state and Redis for ephemeral state.
- Keep controllers thin; business rules belong in services.
- Validate all external input with class-validator DTOs.
- Protect endpoints by default and mark anonymous endpoints with `@Public()`.
- Keep platform and game realtime concerns separated by Socket.IO namespaces.
- Run `npm run build`, `npm test`, and `npm run test:e2e` after behavioral changes.
- Do not commit secrets; update `.env.example` for new configuration.
