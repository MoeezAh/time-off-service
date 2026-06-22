# Time-Off Service

NestJS and SQLite backend written in JavaScript for managing time-off requests while reconciling balances with an external HCM system.

## Requirements

- Node.js 24 or newer
- npm

## Setup

```powershell
npm install
Copy-Item .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

The API listens on `http://localhost:3000`. The health endpoint is `GET /health`. Swagger is available at `/api/docs` when `SWAGGER_ENABLED=true`.

## Technology Stack

- NestJS 11
- JavaScript ES modules
- SQLite with Sequelize
- Vitest and Supertest

The service intentionally does not use Next.js, React, or TypeScript.

## API

All `/api/*` routes require an HS256 bearer JWT containing a user identifier in `sub` or `userId`, plus a `role` claim.

### Requests

- `POST /api/time-off-requests`
- `GET /api/time-off-requests`
- `GET /api/time-off-requests/:id`
- `PATCH /api/time-off-requests/:id/approve`
- `PATCH /api/time-off-requests/:id/reject`
- `PATCH /api/time-off-requests/:id/cancel`

Request creation accepts idempotency through the `Idempotency-Key` header.

### Balances

- `GET /api/balances`
- `GET /api/balances/:id`
- `POST /api/balances/sync`

The sync endpoint accepts the complete HCM balance corpus:

```json
{
  "balances": [
    {
      "employeeId": "uuid",
      "locationId": "uuid",
      "leaveTypeId": "uuid",
      "balance": 20
    }
  ]
}
```

### Administration

- `GET /api/audit-logs`
- `GET /api/audit-logs/correlation-id/:correlationId`
- `GET /api/audit-logs/entity/:entityType/:entityId`
- `GET /api/reconciliation`

## Verification

```powershell
npm run build
npm run lint
npm test
```

The integration suite uses in-memory SQLite and exercises application handlers, repositories, optimistic locking, idempotency, audit/outbox writes, and transaction rollback.

## Architecture

- Presentation: NestJS controllers and HTTP concerns
- Application: lifecycle command handlers and read queries
- Infrastructure: Sequelize repositories, SQLite, outbox worker
- Integration: HCM client and mock HCM service

Local lifecycle writes are transactionally grouped. Balance changes use conditional SQL updates with version checks to prevent lost updates.

## Docker

```powershell
npm run docker:build
npm run docker:up
```

Docker Compose starts the API on port 3000 and the mock HCM service on port 3001.

## Documentation

- [Technical requirements](docs/TRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Architecture decisions](docs/ADR.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Implementation handoff](docs/IMPLEMENTATION.md)

The implementation handoff records completed work, verification results, known limitations, and the next work items.
