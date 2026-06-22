# Deployment Guide

## Local Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Run migrations
npm run db:migrate

# Seed test data
npm run db:seed

# Start development server
npm run dev
```

App: http://localhost:3000
Docs: http://localhost:3000/api/docs

---

## Docker & Docker Compose

### Build

```bash
npm run docker:build
```

### Run Locally

```bash
npm run docker:up
```

Services:
- **Time-Off Service:** http://localhost:3000
- **Mock HCM:** http://localhost:3001

### Stop

```bash
npm run docker:down
```

---

## Production Deployment

### Prerequisites
- Node.js 24+ runtime
- PostgreSQL 14+ (replace SQLite)
- Redis (optional, for caching)

### Environment Setup

```bash
# Production .env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/timeoff
HCM_BASE_URL=https://hcm.production.com
JWT_SECRET=<strong-secret-key>
LOG_LEVEL=info
```

### Build & Deploy

```bash
# Build Docker image
docker build -t time-off-service:1.0.0 .

# Push to registry
docker push registry.example.com/time-off-service:1.0.0

# Kubernetes deployment
kubectl apply -f k8s/deployment.yaml
```

### Database Migration (Production)

```bash
# Backup existing database
pg_dump timeoff > backup-$(date +%Y%m%d).sql

# Run migrations
NODE_ENV=production npm run db:migrate

# Verify
SELECT * FROM balances LIMIT 1;
```

---

## Health Checks

```bash
# Liveness check
curl http://localhost:3000/health

# Expected response
{
  "status": "up",
  "timestamp": "2026-06-21T12:00:00Z",
  "uptime": 3600
}
```

---

## Monitoring

### Logs
```bash
# View logs
docker logs -f time-off-service

# Filter by level
grep '\[ERROR\]' logs/*.log
```

### Metrics
- Request latency: p95 < 1s
- Error rate: < 0.1%
- Event processing lag: < 5s
- Database connection pool: 10-20 active

---

## Troubleshooting

| Issue | Solution |
|---|---|
| Port already in use | `lsof -i :3000`, kill process or use different PORT |
| Database locked (SQLite) | Restart app, migrate to PostgreSQL for prod |
| HCM unreachable | Check `HCM_BASE_URL`, verify network, check HCM status |
| Events stuck in outbox | Check event worker logs, verify database connectivity |
| High latency | Check database query performance, add indexes, scale horizontally |

---

## Backup & Recovery

```bash
# Backup SQLite
cp data/time-off.db data/time-off.db.backup

# Backup PostgreSQL
pg_dump timeoff > timeoff-$(date +%Y%m%d-%H%M%S).sql

# Restore
psql timeoff < timeoff-20260621-120000.sql
```

---

**Deployment Version:** 1.0  
**Last Updated:** 2026-06-21
