# ⚡ PDITS Quick Start

Panduan super cepat untuk mulai development.

## 🎯 TL;DR

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment variables
copy .env.example .env

# 3. Start database
docker-compose up -d

# 4. Run migration & seed
pnpm db:migrate

# 5. Start backend
pnpm dev:api
```

## 📝 Detailed Steps

### 1. Install Dependencies (2-5 menit)

```bash
cd pdits
pnpm install
```

### 2. Setup Environment

```bash
copy .env.example .env
```

Edit `.env` - **WAJIB ganti JWT secrets!**

### 3. Start Database (30 detik)

```bash
docker-compose up -d
```

Tunggu hingga MySQL ready:

```bash
docker-compose ps
# Pastikan status "Up" dan healthy
```

### 4. Setup Database (1 menit)

```bash
pnpm db:migrate
```

Output yang diharapkan:
```
✅ Created users
✅ Created 5 sample items
✅ Created sample daily schedules
🎉 Database seed completed!
```

### 5. Start Backend API

```bash
pnpm dev:api
```

Output:
```
🚀 PDITS API Server is running!
📍 URL: http://localhost:3001
```

### 6. Test API

Buka browser: http://localhost:3001/api/v1/health

Response:
```json
{
  "status": "ok",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

## ✅ Done!

Backend API siap digunakan di `http://localhost:3001`

## 🔍 Explore Data

```bash
# Open Prisma Studio (Database GUI)
pnpm db:studio
```

Browser akan buka di `http://localhost:5555`

## 🧪 Test Database

```bash
pnpm --filter @pdits/api tsx src/lib/test-db.ts
```

## 📚 Default Users

| Email | Password | Role |
|-------|----------|------|
| admin@pdits.com | password123 | SUPER_ADMIN |
| dataentry@pdits.com | password123 | ADMIN |
| user@pdits.com | password123 | USER |

## 🐛 Troubleshooting

**Port 3306 sudah digunakan?**
```bash
# Stop MySQL service atau edit docker-compose.yml
```

**Migration error?**
```bash
# Reset database
pnpm --filter @pdits/api prisma migrate reset
```

**Module not found?**
```bash
# Clean install
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

**TypeScript errors?**
```bash
# Generate Prisma Client
pnpm db:generate

# Reload VS Code
# Ctrl+Shift+P → "Reload Window"
```

**More issues?**
- Check `TROUBLESHOOTING.md` for detailed solutions

## 📖 Full Documentation

- **Setup lengkap:** `SETUP.md`
- **Tech stack:** `PDITS_TechStack.md`
- **User flow:** `PDITS_UserFlow.md`
- **README:** `README.md`

---

**Total waktu setup: ~10 menit** ⏱️
