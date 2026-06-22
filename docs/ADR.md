# Architecture Decision Records (ADRs)

## ADR-001: Use Optimistic Locking for Concurrency Control

**Status:** Accepted  
**Date:** 2026-06-21

### Context
Multiple employees may request time-off simultaneously for the same balance. The system needs to prevent double-booking and lost updates without row-level locks (SQLite limitation).

### Decision
Use optimistic locking with a `version` column on the Balance table.

### Rationale
1. **No Lock Contention:** Version-based instead of row-based locks
2. **SQLite Compatible:** Works with SQLite (dev) and PostgreSQL (prod)
3. **Better Performance:** Readers never blocked
4. **Conflict Detection:** Client can detect and retry with updated version
5. **Testable:** Can simulate race conditions easily

### Consequences
- ✅ Prevents lost updates and balance corruption
- ✅ Scales well under concurrent load
- ⚠️ Clients must handle CONCURRENT_MODIFICATION errors and retry
- ⚠️ Requires version awareness in API contracts

### Implementation
```javascript
// Balance model: version INTEGER NOT NULL DEFAULT 0
// On update: WHERE id = ? AND version = ? UPDATE version = version + 1
// If no rows affected: CONCURRENT_MODIFICATION error
```

---

## ADR-002: Outbox Pattern for Reliable Event Publishing

**Status:** Accepted  
**Date:** 2026-06-21

### Context
Events (TimeOffRequested, Approved, etc.) must be reliably published to subscribers even if the application crashes. Simple in-memory events are lost on failure.

### Decision
Use Outbox Pattern: Store events in database before publishing. Background worker processes and publishes asynchronously.

### Rationale
1. **Durability:** Events survive crashes (stored in database)
2. **Ordering:** Events processed in creation order
3. **Idempotency:** Events can be replayed safely
4. **Decoupling:** Publishers don't need to know subscribers
5. **Audit Trail:** All events tracked permanently

### Consequences
- ✅ No event loss, guaranteed delivery
- ✅ Can add new subscribers without changing publisher
- ✅ Full audit history maintained
- ⚠️ Added database I/O
- ⚠️ Eventual consistency (not immediate)
- ⚠️ Worker must be running for events to process

### Implementation
```sql
CREATE TABLE outboxEvents (
  id UUID PRIMARY KEY,
  eventType STRING,
  payload JSON,
  status ENUM ('PENDING', 'PUBLISHED', 'COMPLETED', 'FAILED'),
  createdAt DATETIME
);
```

---

## ADR-003: Defensive HCM Integration

**Status:** Accepted  
**Date:** 2026-06-21

### Context
HCM system (source of truth for balances) may be temporarily unavailable. Users should not be blocked by external system failures. Balances must remain consistent.

### Decision
Trust local balance snapshot. Validate defensively with HCM but don't fail if unavailable. Reconcile asynchronously.

### Rationale
1. **Better UX:** Users not blocked by HCM outages
2. **Resilience:** Service degrades gracefully, doesn't cascade fail
3. **Consistency:** Local snapshot is consistent, HCM eventually caught up
4. **Audit:** Reconciliation process detects and reports drifts

### Consequences
- ✅ Service works even when HCM unavailable
- ✅ Responsive user experience
- ✅ Clear audit trail of drifts
- ⚠️ Eventual consistency (drifts possible short-term)
- ⚠️ Reconciliation process required
- ⚠️ Potential double-spend if HCM and local diverge

### Implementation
```javascript
try {
  await hcmClient.validateBalance(...);
} catch (error) {
  logger.warn('HCM validation failed, trusting local snapshot');
  // Continue with local validation
}
```

---

## ADR-004: Separate HCM Integration into Anti-Corruption Layer

**Status:** Accepted  
**Date:** 2026-06-21

### Context
HCM system has its own domain model and API contracts. We need to translate between HCM concepts and our domain.

### Decision
Create HcmClient class as an anti-corruption layer. Hides HCM specifics from domain logic.

### Rationale
1. **Domain Purity:** Domain doesn't know about HCM details
2. **Reusability:** HCM client usable from multiple handlers
3. **Testability:** Can mock HCM independently
4. **Maintainability:** HCM changes don't affect domain

### Consequences
- ✅ Clean separation of concerns
- ✅ Easy to replace HCM with different system
- ⚠️ Translation layer adds minimal overhead
- ⚠️ Must keep client and domain in sync

---

## ADR-005: CQRS (Command Query Responsibility Segregation)

**Status:** Accepted  
**Date:** 2026-06-21

### Context
Different requirements for state-changing operations (requests, approvals) vs. read operations (balance queries, reports).

### Decision
Separate Command handlers (state changes) from Query handlers (reads).

### Rationale
1. **Clarity:** Intent explicit (Command vs. Query)
2. **Optimization:** Different strategies for reads vs. writes
3. **Scalability:** Can scale read/write paths independently
4. **Testing:** Easier to test isolated handlers
5. **Audit:** Commands have audit trail, queries don't

### Consequences
- ✅ Clear separation of concerns
- ✅ Easy to add caching on read side
- ✅ Better testability
- ⚠️ Slightly more code
- ⚠️ Mental model requires CQRS understanding

---

## Summary

| ADR | Title | Key Decision |
|---|---|---|
| ADR-001 | Optimistic Locking | Version-based concurrency control |
| ADR-002 | Outbox Pattern | Store events before publishing |
| ADR-003 | Defensive HCM | Trust local, reconcile async |
| ADR-004 | Anti-Corruption Layer | HcmClient translation layer |
| ADR-005 | CQRS | Separate commands from queries |

These decisions work together to create a resilient, scalable, maintainable system.

---

**ADRs Version:** 1.0  
**Last Updated:** 2026-06-21
