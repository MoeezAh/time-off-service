# Technical Requirements Document (TRD)
## Time-Off Microservice for ExampleHR

**Version:** 1.0.0  
**Date:** 2026-06-21  
**Status:** Implementation In Progress

---

## 1. Problem Statement

ExampleHR needs a **Time-Off Microservice** to manage employee time-off requests while maintaining balance integrity with an external HCM system (Workday/SAP equivalent). 

**Key Challenge:** The HCM system is the source of truth for balances, but it may be unavailable or updated independently. The system must provide a fast, responsive user experience while ensuring:
- Balance data consistency
- No double-booking of leave
- Race condition prevention under concurrent requests
- Eventual consistency with HCM
- Defensive validation against HCM errors

---

## 2. Functional Requirements

### 2.1 Balance Management
- **FR-1.1:** System shall maintain balances per (Employee, Location, LeaveType) tuple
- **FR-1.2:** Each balance shall track: availableBalance, reservedBalance, usedBalance
- **FR-1.3:** System shall support real-time balance queries
- **FR-1.4:** System shall sync balances from HCM on-demand
- **FR-1.5:** System shall detect and report balance drifts

### 2.2 Time-Off Request Lifecycle
- **FR-2.1:** Employees shall create requests with startDate, endDate, days, reason
- **FR-2.2:** System shall validate locally before HCM
- **FR-2.3:** System shall reserve balance atomically on request creation
- **FR-2.4:** Managers shall approve/reject pending requests
- **FR-2.5:** Employees shall cancel approved/pending requests
- **FR-2.6:** System shall maintain full audit trail

### 2.3 Request Flow
- **FR-3.1:** Create Request Flow
  - Validate request locally
  - Check local balance snapshot
  - Validate with HCM
  - Reserve balance (optimistic locking)
  - Create request entity
  - Publish domain event
  
- **FR-3.2:** Approval Flow
  - Validate current state
  - Revalidate balance
  - Call HCM apply-leave
  - Update status
  - Move from reserved to used
  - Publish event
  
- **FR-3.3:** Rejection Flow
  - Release reserved balance
  - Update status
  - Publish event
  
- **FR-3.4:** Cancellation Flow
  - Handle both PENDING and APPROVED states
  - Release/move balance accordingly
  - Notify HCM (best effort)
  - Publish event

### 2.4 HCM Integration
- **FR-4.1:** System shall call HCM real-time endpoints: GET balance, POST validate, POST apply-leave
- **FR-4.2:** System shall process batch sync (POST /hcm/full-sync) with complete balance corpus
- **FR-4.3:** System shall implement retry logic with exponential backoff
- **FR-4.4:** System shall handle HCM timeouts gracefully
- **FR-4.5:** System shall not fail on HCM errors (defensive design)

### 2.5 Idempotency
- **FR-5.1:** System shall support Idempotency-Key header
- **FR-5.2:** Duplicate requests with same key shall return cached response
- **FR-5.3:** Idempotency keys shall expire after 24 hours

### 2.6 Concurrency Control
- **FR-6.1:** System shall use optimistic locking with version columns
- **FR-6.2:** Concurrent modifications shall be detected and rejected
- **FR-6.3:** Race conditions shall never cause balance corruption

### 2.7 Event-Driven Design
- **FR-7.1:** System shall emit domain events (TimeOffRequested, Approved, Rejected, etc.)
- **FR-7.2:** System shall use Outbox Pattern for reliable event publishing
- **FR-7.3:** Events shall be processed in background worker
- **FR-7.4:** Failed events shall be retried

### 2.8 Audit & Compliance
- **FR-8.1:** Every action shall be logged: who, when, what changed, old/new values
- **FR-8.2:** Audit logs shall be immutable (append-only)
- **FR-8.3:** Logs shall include correlation IDs for tracing
- **FR-8.4:** Admin shall view audit trail by entity, action, or correlation ID

---

## 3. Non-Functional Requirements

### 3.1 Performance
- **NFR-1.1:** Request creation response: < 500ms (p95)
- **NFR-1.2:** Balance query response: < 100ms (p95)
- **NFR-1.3:** Approval response: < 1s (p95, includes HCM call)
- **NFR-1.4:** System shall handle 100+ concurrent users

### 3.2 Reliability
- **NFR-2.1:** Availability: ≥ 99.5% uptime
- **NFR-2.2:** No balance corruption, ever
- **NFR-2.3:** Request recovery on failure
- **NFR-2.4:** Graceful degradation on HCM unavailability

### 3.3 Consistency
- **NFR-3.1:** Strong consistency within local database
- **NFR-3.2:** Eventual consistency with HCM
- **NFR-3.3:** Maximum drift: 1 day (detected and reported)
- **NFR-3.4:** Reconciliation runs automatically every hour

### 3.4 Security
- **NFR-4.1:** JWT-based authentication
- **NFR-4.2:** Role-based access control (Employee, Manager, Admin)
- **NFR-4.3:** All endpoints require authentication
- **NFR-4.4:** Employees see only their own requests/balances

### 3.5 Scalability
- **NFR-5.1:** Database: SQLite → PostgreSQL migration ready
- **NFR-5.2:** Horizontal scaling: stateless application servers
- **NFR-5.3:** Event worker: can scale independently
- **NFR-5.4:** Support 1M+ employees, 10M+ requests annually

### 3.6 Observability
- **NFR-6.1:** All operations logged with structured format
- **NFR-6.2:** Correlation IDs for tracing
- **NFR-6.3:** Health check endpoint
- **NFR-6.4:** Metrics for key operations

### 3.7 Testability
- **NFR-7.1:** ≥ 95% code coverage
- **NFR-7.2:** Concurrency tests: 10/20/50 parallel requests
- **NFR-7.3:** Contract tests with mock HCM
- **NFR-7.4:** All tests run in < 10 seconds

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Client Applications                          │
│                    (ExampleHR Frontend)                          │
└────────────────────────┬────────────────────────────────────────┘
                         │ JWT Auth
                         │ REST API
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Time-Off Service (NestJS)                      │
├──────────────┬──────────────────┬───────────────┬───────────────┤
│ Controllers  │   Commands       │   Queries     │  Auth Guards  │
│ (REST API)   │ (State Change)   │ (Read Data)   │               │
└──────────────┴──────────────────┴───────────────┴───────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Repositories │ │ Event Bus    │ │ HCM Client   │
│ (CRUD)       │ │ (Outbox)     │ │ (Sync/Call)  │
└──────────────┘ └──────────────┘ └──────────────┘
        │                │                │
        └────────────────┼────────────────┘
                         ▼
        ┌────────────────────────────────┐
        │    SQLite Database              │
        │  (Balance, Request, Audit,      │
        │   OutboxEvent, Idempotency)     │
        └────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │  Event Worker (Background)      │
        │  (Process outbox events)        │
        └────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │     External Systems             │
        │  (Webhooks, Notifications)      │
        └────────────────────────────────┘
```

### Architecture Layers

**Domain Layer** - Business entities, value objects, rules
- Employee, Location, LeaveType, Balance (with version)
- TimeOffRequest (with state machine)
- Domain events

**Application Layer** - Use cases, business logic
- Commands: Create, Approve, Reject, Cancel, Sync
- Queries: GetBalances, GetRequests, GetReconciliation
- Defensive validations
- Idempotency handling
- Concurrency control (optimistic locking)

**Infrastructure Layer** - Technical implementations
- Sequelize ORM, SQLite database
- Repository pattern for persistence
- HCM client with retry logic
- Outbox event storage & worker

**Presentation Layer** - REST API
- Controllers for each resource
- DTOs for validation
- Authentication middleware
- Global exception handling
- Swagger/OpenAPI documentation

---

## 5. Key Design Decisions

### 5.1 Optimistic Locking for Concurrency
**Decision:** Use version columns on Balance table
**Rationale:** 
- No row-level locks (SQLite limitation)
- Better performance under contention
- Detects but doesn't prevent conflicts
- Client must retry with updated data

### 5.2 Local Snapshot + HCM Reconciliation
**Decision:** Cache balance locally, sync periodically with HCM
**Rationale:**
- Fast UI response (no HCM call on every request)
- Works when HCM unavailable
- Detects drifts asynchronously
- Eventual consistency acceptable for time-off

### 5.3 Outbox Pattern for Events
**Decision:** Store events before publishing, process asynchronously
**Rationale:**
- Ensures no event loss on failures
- Decouples producers from consumers
- Easier to add new subscribers
- Enables audit trail

### 5.4 Defensive HCM Integration
**Decision:** Continue on HCM errors, trust local state
**Rationale:**
- HCM may be temporarily unavailable
- Local validation is sufficient
- Retry logic handles transient failures
- Reconciliation catches inconsistencies

---

## 6. Data Model

```
Balance
├── id: UUID (Primary Key)
├── employeeId: UUID (Foreign Key)
├── locationId: UUID (Foreign Key)
├── leaveTypeId: UUID (Foreign Key)
├── availableBalance: Decimal
├── reservedBalance: Decimal
├── usedBalance: Decimal
├── version: Integer (Optimistic locking)
├── syncStatus: ENUM (SYNCED, PENDING, FAILED)
├── lastSyncedAt: DateTime
└── (Unique Index: employeeId, locationId, leaveTypeId)

TimeOffRequest
├── id: UUID (Primary Key)
├── employeeId: UUID (Foreign Key)
├── locationId: UUID (Foreign Key)
├── leaveTypeId: UUID (Foreign Key)
├── startDate: Date
├── endDate: Date
├── days: Decimal
├── reason: String (nullable)
├── status: ENUM (PENDING, APPROVED, REJECTED, CANCELLED, SYNCING, SYNC_FAILED)
├── approverId: UUID (nullable)
├── approvalNotes: String (nullable)
├── rejectionReason: String (nullable)
├── idempotencyKey: String (unique, nullable)
├── hcmRequestId: String (nullable)
└── (Indexes: employeeId+status, status, dates)

AuditLog
├── id: UUID (Primary Key)
├── entityType: String
├── entityId: UUID
├── action: ENUM (CREATE, UPDATE, DELETE, APPROVE, REJECT, CANCEL, SYNC)
├── actor: UUID (FK to Employee, nullable)
├── oldValue: JSON
├── newValue: JSON
├── correlationId: String
├── metadata: JSON
└── createdAt: DateTime (immutable, append-only)

OutboxEvent
├── id: UUID (Primary Key)
├── eventType: String
├── aggregateId: UUID
├── aggregateType: String
├── payload: JSON
├── status: ENUM (PENDING, PUBLISHED, COMPLETED, FAILED)
├── processedAt: DateTime (nullable)
├── error: String (nullable)
├── retryCount: Integer
└── createdAt: DateTime

IdempotencyKey
├── id: UUID (Primary Key)
├── idempotencyKey: String (unique)
├── requestBody: JSON
├── responseBody: JSON
├── statusCode: Integer
├── status: ENUM (PENDING, COMPLETED, FAILED)
└── expiresAt: DateTime (24h TTL)
```

---

## 7. Failure Modes & Mitigations

| Failure Mode | Impact | Mitigation |
|---|---|---|
| HCM unavailable | Balance validation fails | Trust local snapshot, retry on next sync |
| Network timeout | Request processing slows | Exponential backoff, circuit breaker |
| Concurrent requests | Race condition | Optimistic locking with version checking |
| Database corruption | Data loss | ACID transactions, regular backups |
| Event processing fails | Events accumulate | Retry logic, admin dashboard to retry |
| Balance drift detected | Inconsistency | Automatically reconcile or alert admin |
| Idempotency key expires | Duplicate response cached | Regenerate and retry with new key |
| Out of memory | Service crash | Event pagination, horizontal scaling |

---

## 8. Testing Strategy

| Category | Scope | Coverage | Tools |
|---|---|---|---|
| Unit | Business rules, validation logic | ~40% | Vitest |
| Integration | Database operations, transactions | ~25% | Vitest + SQLite |
| Concurrency | Race conditions (10/20/50 parallel) | ~15% | Vitest workers |
| API | REST endpoints, validation, RBAC | ~15% | Supertest |
| Contract | HCM integration | ~5% | Mock HCM service |
| **Total** | | **95%+** |

---

## 9. Deployment & Operations

### 9.1 Deployment
- Docker multi-stage build (builder → production)
- Docker Compose for local dev
- Kubernetes-ready (stateless)
- Health check endpoint (/health)
- Graceful shutdown (SIGTERM)

### 9.2 Configuration
- Environment variables (.env)
- Database: SQLite (dev), PostgreSQL (prod)
- Log levels: debug, info, warn, error
- Event polling interval: 1000ms
- HCM timeout: 5000ms
- Retry attempts: 3 with exponential backoff

### 9.3 Monitoring
- Structured logging with correlation IDs
- Metrics: request count, latency, errors
- Audit logs for compliance
- Reconciliation reports
- Event processing status

---

## 10. Glossary

- **HCM:** Human Capital Management system (e.g., Workday, SAP SuccessFactors)
- **Balance:** Available, reserved, and used days for a specific leave type
- **Optimistic Locking:** Version-based concurrency control
- **Outbox Pattern:** Storing events before publishing for reliability
- **Eventual Consistency:** System converges to consistent state over time
- **Correlation ID:** Unique ID for tracing related operations
- **Defensive Design:** Continue operation even when external systems fail

---

**Document Control**
- **Created:** 2026-06-21
- **Last Updated:** 2026-06-21
- **Owner:** Backend Architecture Team
- **Confidentiality:** Internal
