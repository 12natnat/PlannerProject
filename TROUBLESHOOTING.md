# 🔧 PDITS Troubleshooting Guide

Panduan mengatasi masalah umum saat development PDITS.

---

## 🐛 Common Issues

### 1. TypeScript Error: "Cannot find type definition file for 'node'"

**Error:**
```
Cannot find type definition file for 'node'.
The file is in the program because:
Entry point of type library 'node' specified in compilerOptions
```

**Cause:**
Package `@types/node` belum terinstall.

**Solution:**
```bash
# Install dependencies
cd pdits
pnpm install

# Atau install manual
pnpm --filter @pdits/api add -D @types/node
```

**Verify:**
```bash
# Check if @types/node is installed
pnpm --filter @pdits/api list @types/node
```

---

### 2. Port Already in Use

**Error:**
```
Error: listen EADDRINUSE: address already in use :::3001
Error: listen EADDRINUSE: address already in use :::3306
```

**Solution:**

**Option A: Kill the process**
```bash
# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Or use npx
npx kill-port 3001 3306 6379
```

**Option B: Change port**
Edit `.env`:
```env
PORT=3002  # Change from 3001
```

---

### 3. Docker Container Not Starting

**Error:**
```
ERROR: for pdits-mysql-dev  Container "xxx" is unhealthy
```

**Solution:**

**Check logs:**
```bash
docker-compose logs mysql
docker-compose logs redis
```

**Restart containers:**
```bash
docker-compose down
docker-compose up -d
```

**Check status:**
```bash
docker-compose ps
```

**Wait for healthy status:**
```bash
# MySQL takes ~30 seconds to be ready
docker-compose ps
# Wait until STATUS shows "healthy"
```

---

### 4. Prisma Client Not Generated

**Error:**
```
Cannot find module '@prisma/client'
```

**Solution:**
```bash
# Generate Prisma Client
pnpm --filter @pdits/api prisma:generate

# Or
pnpm db:generate
```

---

### 5. Database Connection Error

**Error:**
```
Error: P1001: Can't reach database server at `localhost:3306`
```

**Solution:**

**Check Docker:**
```bash
docker-compose ps
# Ensure mysql container is running
```

**Check .env:**
```env
DATABASE_URL=mysql://pdits:devpassword@localhost:3306/pdits_dev
```

**Test connection:**
```bash
# Try connecting via Docker
docker exec -it pdits-mysql-dev mysql -u pdits -pdevpassword pdits_dev
```

**Restart MySQL:**
```bash
docker-compose restart mysql
```

---

### 6. Redis Connection Error

**Error:**
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Solution:**

**Check Docker:**
```bash
docker-compose ps
# Ensure redis container is running
```

**Check .env:**
```env
REDIS_URL=redis://localhost:6379
```

**Test connection:**
```bash
docker exec -it pdits-redis-dev redis-cli ping
# Should return: PONG
```

---

### 7. Migration Failed

**Error:**
```
Error: P3009: migrate found failed migrations
```

**Solution:**

**Option A: Reset database (⚠️ DELETES ALL DATA)**
```bash
pnpm --filter @pdits/api prisma migrate reset
```

**Option B: Resolve manually**
```bash
# Mark migration as applied
pnpm --filter @pdits/api prisma migrate resolve --applied <migration_name>

# Or mark as rolled back
pnpm --filter @pdits/api prisma migrate resolve --rolled-back <migration_name>
```

---

### 8. Module Not Found

**Error:**
```
Cannot find module '@pdits/shared'
```

**Solution:**

**Build shared package:**
```bash
pnpm --filter @pdits/shared build
```

**Or build all:**
```bash
pnpm build
```

**Clean install:**
```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

---

### 9. pnpm Command Not Found

**Error:**
```
'pnpm' is not recognized as an internal or external command
```

**Solution:**
```bash
# Install pnpm globally
npm install -g pnpm

# Verify
pnpm --version
```

---

### 10. Docker Not Running

**Error:**
```
Cannot connect to the Docker daemon
```

**Solution:**

**Windows:**
- Open Docker Desktop
- Wait until Docker is running
- Check system tray icon

**Verify:**
```bash
docker --version
docker ps
```

---

## 🔍 Diagnostic Commands

### Check Everything

```bash
# 1. Check Node.js
node --version
# Should be v20+

# 2. Check pnpm
pnpm --version
# Should be v8+

# 3. Check Docker
docker --version
docker-compose --version

# 4. Check containers
docker-compose ps
# Both mysql and redis should be "Up" and "healthy"

# 5. Check database connection
pnpm --filter @pdits/api tsx src/lib/test-db.ts

# 6. Check API health
curl http://localhost:3001/api/v1/health
```

---

## 🧹 Clean Reset (Nuclear Option)

If nothing works, try complete reset:

```bash
# 1. Stop all containers
docker-compose down -v

# 2. Clean install
rm -rf node_modules apps/*/node_modules packages/*/node_modules pnpm-lock.yaml
pnpm install

# 3. Restart containers
docker-compose up -d

# 4. Wait for MySQL to be ready (30 seconds)
docker-compose ps

# 5. Reset database
pnpm --filter @pdits/api prisma migrate reset

# 6. Start backend
pnpm dev:api
```

---

## 📝 Environment Variables Issues

### Missing .env File

**Error:**
```
Error: DATABASE_URL is not defined
```

**Solution:**
```bash
# Copy template
copy .env.example .env

# Edit .env and fill in values
```

### Invalid DATABASE_URL

**Format:**
```env
DATABASE_URL=mysql://USER:PASSWORD@HOST:PORT/DATABASE

# Example:
DATABASE_URL=mysql://pdits:devpassword@localhost:3306/pdits_dev
```

### JWT Secrets Not Set

**Error:**
```
Warning: Using default JWT secret
```

**Solution:**

Generate strong secrets:
```bash
# Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Add to `.env`:
```env
JWT_SECRET=<generated-secret-64-chars>
JWT_REFRESH_SECRET=<generated-secret-64-chars>
```

---

## 🐳 Docker Issues

### Port Conflicts

**MySQL port 3306 in use:**
```yaml
# Edit docker-compose.yml
services:
  mysql:
    ports:
      - "3307:3306"  # Change external port
```

Update `.env`:
```env
DATABASE_URL=mysql://pdits:devpassword@localhost:3307/pdits_dev
```

### Volume Issues

**Error:**
```
Error: database is locked
```

**Solution:**
```bash
# Remove volumes
docker-compose down -v

# Restart
docker-compose up -d
```

---

## 🧪 Testing Issues

### Tests Failing

**Check test database:**
```env
# .env.test
DATABASE_URL=mysql://pdits:devpassword@localhost:3306/pdits_test
```

**Reset test database:**
```bash
NODE_ENV=test pnpm --filter @pdits/api prisma migrate reset
```

---

## 💻 IDE Issues

### VS Code TypeScript Errors

**Solution:**

1. Reload VS Code window:
   - `Ctrl+Shift+P` → "Reload Window"

2. Restart TypeScript server:
   - `Ctrl+Shift+P` → "TypeScript: Restart TS Server"

3. Check TypeScript version:
   - Bottom right corner of VS Code
   - Should use workspace version

---

## 🆘 Still Having Issues?

### Get Help

1. **Check logs:**
   ```bash
   # Backend logs
   pnpm dev:api
   
   # Docker logs
   docker-compose logs -f
   
   # Specific container
   docker-compose logs mysql
   ```

2. **Check documentation:**
   - SETUP.md - Detailed setup
   - COMMANDS.md - Command reference
   - DATABASE_GUIDE.md - Database issues

3. **Verify setup:**
   ```bash
   # Run diagnostic
   pnpm --filter @pdits/api tsx src/lib/test-db.ts
   ```

4. **Create issue:**
   - Include error message
   - Include logs
   - Include environment (OS, Node version, etc.)

---

## 📚 Related Documentation

- **SETUP.md** - Detailed setup guide
- **COMMANDS.md** - Command reference
- **DATABASE_GUIDE.md** - Database operations
- **QUICKSTART.md** - Fast setup

---

**Last Updated:** Mei 2026  
**Version:** 1.0.0
