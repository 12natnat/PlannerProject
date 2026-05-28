# 🎮 PDITS Command Reference

Quick reference untuk semua commands yang sering digunakan.

---

## 📦 Installation & Setup

```bash
# Install dependencies
pnpm install

# Copy environment variables
copy .env.example .env

# Start database containers
docker-compose up -d

# Run database migration & seed
pnpm db:migrate

# Generate Prisma Client
pnpm db:generate
```

---

## 🚀 Development

### Start Services

```bash
# Start backend API (port 3001)
pnpm dev:api

# Start frontend (port 5173) - coming soon
pnpm dev:web

# Start both (parallel)
pnpm dev
```

### Build

```bash
# Build all packages
pnpm build

# Build specific package
pnpm build:api
pnpm build:web
```

---

## 🗄️ Database

### Prisma Commands

```bash
# Open Prisma Studio (GUI)
pnpm db:studio

# Generate Prisma Client
pnpm db:generate

# Create new migration
pnpm db:migrate

# Deploy migrations (production)
pnpm db:deploy

# Reset database (⚠️ DELETES ALL DATA!)
pnpm --filter @pdits/api prisma migrate reset

# Seed database
pnpm --filter @pdits/api prisma:seed

# Format schema
pnpm --filter @pdits/api prisma format
```

### Direct Database Access

```bash
# Connect to MySQL via Docker
docker exec -it pdits-mysql-dev mysql -u pdits -pdevpassword pdits_dev

# Backup database
docker exec pdits-mysql-dev mysqldump -u pdits -pdevpassword pdits_dev > backup.sql

# Restore database
docker exec -i pdits-mysql-dev mysql -u pdits -pdevpassword pdits_dev < backup.sql
```

---

## 🐳 Docker

### Container Management

```bash
# Start containers
docker-compose up -d

# Stop containers
docker-compose down

# Stop and remove volumes (⚠️ DELETES DATA!)
docker-compose down -v

# Restart containers
docker-compose restart

# Restart specific service
docker-compose restart mysql
docker-compose restart redis
```

### Logs & Monitoring

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f mysql
docker-compose logs -f redis

# Check container status
docker-compose ps

# Check resource usage
docker stats
```

### Cleanup

```bash
# Remove stopped containers
docker-compose rm

# Remove unused images
docker image prune

# Remove all unused data
docker system prune -a
```

---

## 🧪 Testing

### Run Tests

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @pdits/api test
pnpm --filter @pdits/web test
pnpm --filter @pdits/shared test

# Run tests in watch mode
pnpm --filter @pdits/api test --watch

# Run tests with coverage
pnpm --filter @pdits/api test --coverage

# Run specific test file
pnpm --filter @pdits/api test src/services/__tests__/item.service.test.ts
```

### Database Tests

```bash
# Test database connection
pnpm --filter @pdits/api tsx src/lib/test-db.ts
```

### E2E Tests (Playwright)

```bash
# Install Playwright browsers
pnpm --filter @pdits/web playwright install

# Run E2E tests
pnpm --filter @pdits/web test:e2e

# Run E2E tests with UI
pnpm --filter @pdits/web playwright test --ui

# Run E2E tests in debug mode
pnpm --filter @pdits/web playwright test --debug

# Generate test report
pnpm --filter @pdits/web playwright show-report
```

---

## 🔍 Code Quality

### Linting

```bash
# Lint all packages
pnpm lint

# Lint specific package
pnpm --filter @pdits/api lint
pnpm --filter @pdits/web lint

# Fix linting issues
pnpm --filter @pdits/api lint --fix
```

### Type Checking

```bash
# Type check all packages
pnpm --recursive tsc --noEmit

# Type check specific package
pnpm --filter @pdits/api tsc --noEmit
```

---

## 📊 API Testing

### Health Check

```bash
# Check API health
curl http://localhost:3001/api/v1/health

# Or with PowerShell
Invoke-WebRequest http://localhost:3001/api/v1/health
```

### Test Endpoints (with curl)

```bash
# Login
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pdits.com","password":"password123"}'

# Get items (with auth)
curl http://localhost:3001/api/v1/items \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Create item
curl -X POST http://localhost:3001/api/v1/items \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"itemCode":"TEST-001","itemName":"Test Item","unit":"pcs"}'
```

---

## 🔧 Utilities

### Generate Secrets

```bash
# Generate JWT secret (Node.js)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate VAPID keys (after installing web-push)
npx web-push generate-vapid-keys
```

### Port Management

```bash
# Check if port is in use (Windows)
netstat -ano | findstr :3001
netstat -ano | findstr :3306
netstat -ano | findstr :6379

# Kill process by port (Windows)
npx kill-port 3001
npx kill-port 3306
npx kill-port 6379
```

### Clean Install

```bash
# Remove all node_modules and lock files
rm -rf node_modules apps/*/node_modules packages/*/node_modules pnpm-lock.yaml

# Reinstall
pnpm install
```

---

## 📦 Package Management

### Add Dependencies

```bash
# Add to root
pnpm add -w <package>

# Add to specific workspace
pnpm --filter @pdits/api add <package>
pnpm --filter @pdits/web add <package>
pnpm --filter @pdits/shared add <package>

# Add dev dependency
pnpm --filter @pdits/api add -D <package>

# Add shared package to another workspace
pnpm --filter @pdits/api add @pdits/shared@workspace:*
```

### Update Dependencies

```bash
# Update all dependencies
pnpm update

# Update specific package
pnpm update <package>

# Check outdated packages
pnpm outdated
```

---

## 🚀 Production

### Build for Production

```bash
# Build all packages
pnpm build

# Build Docker images
docker build -f apps/web/Dockerfile -t pdits-web:latest .
docker build -f apps/api/Dockerfile -t pdits-api:latest .
```

### Deploy

```bash
# Deploy via Dokploy (automatic via Git webhook)
git push origin main

# Manual deploy (if needed)
# See SETUP.md for Dokploy configuration
```

---

## 🐛 Troubleshooting

### Reset Everything

```bash
# Stop containers
docker-compose down -v

# Clean install
rm -rf node_modules apps/*/node_modules packages/*/node_modules pnpm-lock.yaml
pnpm install

# Restart containers
docker-compose up -d

# Reset database
pnpm --filter @pdits/api prisma migrate reset

# Restart backend
pnpm dev:api
```

### Check Logs

```bash
# Backend logs
pnpm dev:api

# Docker logs
docker-compose logs -f

# Prisma logs
# Set in .env: DEBUG=prisma:*
```

### Verify Setup

```bash
# 1. Check Docker containers
docker-compose ps

# 2. Check database connection
pnpm --filter @pdits/api tsx src/lib/test-db.ts

# 3. Check API health
curl http://localhost:3001/api/v1/health

# 4. Open Prisma Studio
pnpm db:studio
```

---

## 📚 Documentation

### Generate API Docs

```bash
# API docs will be available at:
# http://localhost:3001/api/v1/docs
# (after Scalar is configured)
```

### View Documentation

```bash
# Open in browser
start README.md
start SETUP.md
start QUICKSTART.md
```

---

## 🎯 Common Workflows

### Starting Development

```bash
# 1. Start database
docker-compose up -d

# 2. Start backend
pnpm dev:api

# 3. (In another terminal) Start frontend
pnpm dev:web
```

### Adding New Feature

```bash
# 1. Create feature branch
git checkout -b feature/nama-fitur

# 2. Make changes

# 3. Run tests
pnpm test

# 4. Commit
git add .
git commit -m "feat: deskripsi fitur"

# 5. Push
git push origin feature/nama-fitur
```

### Database Changes

```bash
# 1. Edit prisma/schema.prisma

# 2. Create migration
pnpm db:migrate

# 3. Generate Prisma Client
pnpm db:generate

# 4. Update seed if needed
# Edit apps/api/prisma/seed.ts

# 5. Test
pnpm --filter @pdits/api tsx src/lib/test-db.ts
```

---

## 🆘 Emergency Commands

### Database Issues

```bash
# Reset database completely
pnpm --filter @pdits/api prisma migrate reset

# Force push schema (⚠️ DANGEROUS!)
pnpm --filter @pdits/api prisma db push --force-reset
```

### Port Conflicts

```bash
# Kill all Node processes
taskkill /F /IM node.exe

# Kill specific port
npx kill-port 3001 3306 6379 5173
```

### Docker Issues

```bash
# Remove all containers and volumes
docker-compose down -v
docker system prune -a -f

# Restart Docker Desktop
# (via GUI or restart service)
```

---

## 📖 Quick Links

- **API Health:** http://localhost:3001/api/v1/health
- **Prisma Studio:** http://localhost:5555 (run `pnpm db:studio`)
- **Frontend:** http://localhost:5173 (coming soon)
- **API Docs:** http://localhost:3001/api/v1/docs (coming soon)

---

## 💡 Tips

### Aliases (Optional)

Add to your shell profile (`.bashrc`, `.zshrc`, or PowerShell profile):

```bash
# Development
alias pdits-dev="cd /path/to/pdits && pnpm dev"
alias pdits-api="cd /path/to/pdits && pnpm dev:api"
alias pdits-web="cd /path/to/pdits && pnpm dev:web"

# Database
alias pdits-db="cd /path/to/pdits && pnpm db:studio"
alias pdits-migrate="cd /path/to/pdits && pnpm db:migrate"

# Docker
alias pdits-up="cd /path/to/pdits && docker-compose up -d"
alias pdits-down="cd /path/to/pdits && docker-compose down"
alias pdits-logs="cd /path/to/pdits && docker-compose logs -f"
```

### VS Code Tasks

Create `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Start Backend",
      "type": "shell",
      "command": "pnpm dev:api",
      "problemMatcher": []
    },
    {
      "label": "Start Database",
      "type": "shell",
      "command": "docker-compose up -d",
      "problemMatcher": []
    },
    {
      "label": "Prisma Studio",
      "type": "shell",
      "command": "pnpm db:studio",
      "problemMatcher": []
    }
  ]
}
```

---

**Last Updated:** Mei 2026  
**For more details, see:** `README.md`, `SETUP.md`, `QUICKSTART.md`
