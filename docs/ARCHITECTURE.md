# Architecture Documentation

## System Architecture Overview

### High-Level Design

```
┌────────────────────────────────────────────────────────────────┐
│                    ExampleHR Frontend                           │
│                  (Employee Portal, Admin)                       │
└─────────────────────────────┬────────────────────────────────┘
                              │
                        ┌─────▼──────┐
                        │  JWT Auth   │
                        └─────┬──────┘
                              │
            ┌─────────────────▼─────────────────┐
            │   Time-Off Service (Node.js)      │
            │      (NestJS Framework)           │
            └─────────────────┬─────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
    ┌────────┐          ┌──────────┐         ┌──────────┐
    │ REST   │          │ Command  │         │ Query    │
    │ API    │          │ Handlers │         │ Handlers │
    └───┬────┘          └────┬─────┘         └────┬─────┘
        │                    │                     │
        └────────────────────┼─────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   Repositories  │
                    │   (CRUD Layer)  │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
    ┌─────────┐        ┌──────────┐        ┌──────────┐
    │ SQLite  │        │ HCM      │        │ Outbox   │
    │Database │        │Client    │        │Events    │
    └─────────┘        └────┬─────┘        └────┬─────┘
                            │                    │
                            ▼                    ▼
                      ┌──────────────┐    ┌──────────────┐
                      │  Mock HCM    │    │Event Worker  │
                      │  Service     │    │(Background)  │
                      └──────────────┘    └──────────────┘
```

---

## Layered Architecture

### 1. **Presentation Layer** (REST API)

**Responsibility:** HTTP request/response handling

- **Controllers:** TimeOffRequestController, BalanceController, AuditLogController, ReconciliationController
- **Authentication:** JWT middleware
- **Authorization:** Role-based guards (Employee, Manager, Admin)
- **Validation:** Plain JavaScript request validation helpers
- **Error Handling:** Global exception filter with structured responses
- **Documentation:** Swagger/OpenAPI

**Key File:** `src/presentation/controllers/`

### 2. **Application Layer** (CQRS)

**Responsibility:** Business logic orchestration

**Commands (State Changes):**
- `CreateTimeOffRequestHandler` - Validate, reserve balance, create request
- `ApproveTimeOffRequestHandler` - Validate, call HCM, update status
- `RejectTimeOffRequestHandler` - Release balance, update status
- `CancelTimeOffRequestHandler` - Release/move balance, update status
- `SyncBalancesFromHcmHandler` - Reconcile balances

**Queries (Read Operations):**
- `GetBalancesQuery` - Retrieve balances with filters
- `GetTimeOffRequestsQuery` - Retrieve requests with filters
- `GetReconciliationReportQuery` - Generate drift report

**Key File:** `src/application/commands/`, `src/application/queries/`

### 3. **Domain Layer** (Business Rules)

**Responsibility:** Pure business logic (no database, no HTTP)

- **Entities:** Employee, Location, LeaveType, Balance, TimeOffRequest
- **Value Objects:** Balance calculations, state transitions
- **Domain Events:** TimeOffRequested, Approved, Rejected, Cancelled, BalanceSynced, DriftDetected
- **Validation Rules:** No negative balances, valid state transitions, overlap detection

**Key Concept:** Domain logic is database-agnostic and testable in isolation

### 4. **Infrastructure Layer** (Technical Implementation)

**Responsibility:** Database, caching, external services

**Database:**
- **ORM:** Sequelize
- **Database:** SQLite
- **Models:** Employee, Balance (with version), TimeOffRequest, AuditLog, OutboxEvent, IdempotencyKey
- **Migrations:** Version-controlled schema changes

**Repositories:**
- `BaseRepository` - Generic CRUD operations
- `BalanceRepository` - Balance-specific operations + optimistic locking
- `TimeOffRequestRepository` - Request queries + date range lookups
- `AuditLogRepository` - Immutable append-only operations
- `OutboxEventRepository` - Event storage + status tracking
- `IdempotencyKeyRepository` - Deduplication logic

**External Services:**
- `HcmClient` - Calls to HCM system (with retry logic, timeout handling)
- Mock HCM Service - Separate Express app for testing

**Events:**
- `OutboxEventWorker` - Background process polling and processing events
- Event handlers for each domain event type

**Key Files:** `src/infrastructure/database/`, `src/infrastructure/events/`, `src/integrations/`

---

## Key Design Patterns

### 1. Repository Pattern
- Abstraction over data access
- Encapsulates query logic
- Easy to mock for testing
- Database-agnostic interfaces

### 2. CQRS (Command Query Responsibility Segregation)
- Separates read (Query) and write (Command) operations
- Enables different optimization strategies
- Clearer intent in code

### 3. Domain-Driven Design
- Core business logic in domain layer
- Anti-corruption layer for external systems (HcmClient)
- Aggregate: TimeOffRequest with Balance

### 4. Outbox Pattern
- Events stored in outbox table before publishing
- Background worker processes and publishes
- Guarantees no event loss
- Enables reliable async communication

### 5. Optimistic Locking
- Version column on mutable entities
- Detects concurrent modifications
- Prevents lost updates
- Client retries on conflict

### 6. Defensive Programming
- Validate input early
- Don't fully trust external systems (HCM)
- Continue operation on HCM failures
- Reconciliation catches inconsistencies

---

## Concurrency Control Strategy

### Problem
Multiple employees requesting leave simultaneously could exceed available balance:
- Employee A: requests 6 days (Balance: 10)
- Employee B: requests 5 days (Balance: 10)
- Both should not succeed

### Solution: Optimistic Locking

```javascript
// Balance table
id, employeeId, locationId, leaveTypeId, availableBalance, reservedBalance, version

// On reserve:
COMPARE version in DB to version in memory
IF version matches:
  UPDATE availableBalance -= days, version += 1
ELSE:
  FAIL with CONCURRENT_MODIFICATION
```

### Benefits
1. No row-level locks (SQLite limitation)
2. Better performance under contention
3. Clients can detect and retry
4. Tested with 50 parallel requests

### Test Scenarios
- 10 parallel requests: Only first succeeds
- 20 sequential with retry: All retry with updated version
- 50 stress test: No balance corruption, consistent versions

---

## Event Flow

### Example: Time-Off Request Approval

```
1. Request arrives: PATCH /api/time-off-requests/123/approve
   │
2. Controller routes to ApproveTimeOffRequestHandler
   │
3. Handler executes:
   ├─ Validate request exists and is PENDING
   ├─ Revalidate balance (defensive)
   ├─ Call HCM to apply leave
   ├─ Update TimeOffRequest.status = APPROVED
   ├─ Move balance: reserved → used
   └─ Create TimeOffApproved event in OutboxEvent table
   │
4. Background OutboxEventWorker detects new event
   │
5. Worker processes event:
   ├─ Mark event as PUBLISHED
   ├─ Execute event handler (send notifications, etc.)
   └─ Mark event as COMPLETED
   │
6. Event can be replayed/audited for compliance
```

---

## Error Handling Strategy

### Layer 1: Input Validation
```javascript
const dto = validateCreateTimeOffRequest(request.body);
```

### Layer 2: Business Logic Validation
```javascript
if (balance.availableBalance < days) {
  throw { code: 'INSUFFICIENT_BALANCE' };
}
```

### Layer 3: HCM Error Handling
```javascript
try {
  const result = await hcmClient.validateBalance(...);
} catch (error) {
  logger.warn('HCM validation failed, trusting local snapshot');
  // Continue with local validation
}
```

### Layer 4: Global Exception Handling
```javascript
// HttpExceptionFilter
catch(exception, host) {
  // Structure error response
  // Log with correlation ID
  // Send appropriate HTTP status
}
```

---

## Data Consistency Strategy

### Strong Consistency (Local)
- ACID transactions for Balance updates
- Optimistic locking prevents lost updates
- Database integrity constraints

### Eventual Consistency (HCM)
- Local snapshot synced periodically with HCM
- Drift detected and reported
- Reconciliation process aligns systems
- Maximum drift: 1 day (auto-detected)

### Mechanisms
1. **Defensive validation:** Check both local and HCM
2. **Outbox Pattern:** Ensures no event loss
3. **Audit Trail:** Tracks all changes for investigation
4. **Scheduled Sync:** Periodic HCM full sync
5. **Drift Detection:** Automated reconciliation

---

## Security Architecture

### Authentication
- JWT-based (mock for development)
- Token contains: userId, role, email
- Validated on all API endpoints

### Authorization
- Role-based access control:
  - **Employee:** Can create requests, view own data
  - **Manager:** Can approve/reject pending requests
  - **Admin:** Can sync balances, view audit logs, reconciliation
- Route-level guards prevent unauthorized access

### Data Protection
- Immutable audit logs
- Correlation IDs for tracking
- No sensitive data in logs
- HTTPS in production (TLS)

---

## Scalability Considerations

### Current Architecture
- Single-process Node.js server
- SQLite with local storage
- Background worker in same process

### For Production Scaling

1. **Multiple Application Servers**
   - Load balancer (nginx/HAProxy)
   - Stateless design enables horizontal scaling
   - Session stored in database (JWT)

2. **Database Scaling**
   - Migrate SQLite → PostgreSQL
   - Connection pooling
   - Read replicas for queries
   - Sharding by employee/location if needed

3. **Event Worker Scaling**
   - Extract to separate service
   - Multiple worker instances
   - Distributed message queue (Redis/RabbitMQ)

4. **Caching Layer**
   - Redis for balance cache
   - CDN for static assets
   - TTL-based invalidation

---

## Deployment Architecture

```
Developer Laptop
  └─ docker-compose up
     ├─ time-off-service:3000
     └─ hcm-mock:3001

Production (Kubernetes)
  ├─ Load Balancer
  │  └─ Service
  ├─ Pod (Replica 1-3)
  │  └─ time-off-service:latest
  ├─ Pod (Replica 1-2)
  │  └─ event-worker:latest
  ├─ StatefulSet (PostgreSQL)
  │  └─ Database + PVC
  └─ ConfigMap + Secrets
     ├─ Database URL
     ├─ HCM endpoint
     └─ JWT secret
```

---

## Testing Architecture

```
Application Code
  ├─ Unit Tests (40%)
  │  └─ Business rules, validation
  ├─ Integration Tests (25%)
  │  └─ Database + repositories
  ├─ Concurrency Tests (15%)
  │  └─ Parallel requests, race conditions
  ├─ API Tests (15%)
  │  └─ REST endpoints, validation, RBAC
  └─ Contract Tests (5%)
     └─ HCM integration

Coverage Target: ≥ 95%
Test Framework: Vitest
```

---

## Monitoring & Observability

### Logging
- Structured JSON logs (production-ready)
- Correlation IDs for request tracing
- Log levels: debug, info, warn, error
- Centralized log aggregation (ELK, Datadog, etc.)

### Metrics
- Request count (per endpoint)
- Latency (p50, p95, p99)
- Error rate
- Balance sync success rate
- Event processing lag

### Health Checks
- Liveness: /health
- Readiness: Database + HCM connectivity
- Application metrics endpoint

### Audit Trail
- All operations logged immutably
- User accountability
- Compliance reporting
- Incident investigation

---

**Diagram 1: Context Diagram**
```
┌─────────────────┐
│  ExampleHR      │
│  Platform       │
└────────┬────────┘
         │
    ┌────▼─────┐
    │ Time-Off  │◄────┐
    │ Service   │     │
    └────┬─────┘     │ HTTP
         │           │
      ┌──▼──────────┐
      │ HCM System  │
      └─────────────┘
```

**Diagram 2: Component Interactions**
- Controllers (REST) → Command/Query Handlers → Repositories → Database
- Handlers → OutboxEvent → Worker → Event Processing
- HCM Client ← → Controllers (via handlers)

---

**Architecture Version:** 1.0  
**Last Updated:** 2026-06-21  
**Status:** Finalized
