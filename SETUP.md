# 🚀 PDITS Setup Guide

Panduan lengkap untuk setup PDITS dari awal.

## 📋 Prerequisites

Pastikan sudah terinstall:

- ✅ **Node.js** v20 atau lebih baru ([Download](https://nodejs.org/))
- ✅ **pnpm** v8 atau lebih baru
- ✅ **Docker Desktop** ([Download](https://www.docker.com/products/docker-desktop/))
- ✅ **Git** ([Download](https://git-scm.com/))

### Install pnpm

Jika belum punya pnpm:

```bash
npm install -g pnpm
```

Verifikasi instalasi:

```bash
node --version    # Should be v20+
pnpm --version    # Should be v8+
docker --version  # Should show Docker version
```

## 🛠️ Step-by-Step Setup

### 1️⃣ Navigate to Project Directory

```bash
cd pdits
```

### 2️⃣ Install Dependencies

```bash
pnpm install
```

Ini akan menginstall semua dependencies untuk:
- Frontend (React, Vite, TanStack, dll)
- Backend (Fastify, Prisma, dll)
- Shared packages

**Waktu estimasi:** 2-5 menit tergantung koneksi internet.

### 3️⃣ Setup Environment Variables

Copy file `.env.example` menjadi `.env`:

```bash
# Windows (PowerShell)
copy .env.example .env

# Windows (CMD)
copy .env.example .env

# Linux/Mac
cp .env.example .env
```

Edit file `.env` dan sesuaikan konfigurasi:

```env
# Database - sesuaikan dengan docker-compose.yml
DATABASE_URL=mysql://pdits:devpassword@localhost:3306/pdits_dev

# Redis
REDIS_URL=redis://localhost:6379

# JWT - GANTI dengan random string yang kuat!
JWT_SECRET=your-super-secret-jwt-key-min-64-characters-long-change-this
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-64-characters-long-change-this

# App
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173
```

**⚠️ PENTING:** Untuk production, gunakan JWT secret yang kuat dan random!

Generate JWT secret dengan:

```bash
# Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Online
# Atau gunakan: https://generate-secret.vercel.app/64
```

### 4️⃣ Start Database Services (MySQL & Redis)

```bash
docker-compose up -d
```

Perintah ini akan:
- Download image MySQL 8.0 dan Redis 7 (jika belum ada)
- Start container MySQL di port 3306
- Start container Redis di port 6379

Cek status container:

```bash
docker-compose ps
```

Output yang diharapkan:

```
NAME                 STATUS              PORTS
pdits-mysql-dev      Up 10 seconds       0.0.0.0:3306->3306/tcp
pdits-redis-dev      Up 10 seconds       0.0.0.0:6379->6379/tcp
```

**Troubleshooting:**

Jika port 3306 atau 6379 sudah digunakan:

```bash
# Cek port yang digunakan
netstat -ano | findstr :3306
netstat -ano | findstr :6379

# Stop service yang menggunakan port tersebut, atau
# Edit docker-compose.yml untuk menggunakan port lain
```

### 5️⃣ Generate Prisma Client

```bash
pnpm --filter @pdits/api prisma:generate
```

Ini akan generate TypeScript types dari schema Prisma.

### 6️⃣ Run Database Migration

```bash
pnpm db:migrate
```

Perintah ini akan:
- Membuat database `pdits_dev` (jika belum ada)
- Membuat semua tabel sesuai schema Prisma
- Menjalankan seed data (users, items, sample data)

**Output yang diharapkan:**

```
✔ Generated Prisma Client
✔ Applied migration(s)
🌱 Starting database seed...
✅ Created users: { superAdmin: 'admin@pdits.com', ... }
✅ Created 5 sample items
✅ Created sample daily schedules
✅ Created sample FG stocks
✅ Created sample WIPs
🎉 Database seed completed!
```

### 7️⃣ Verify Database

Buka Prisma Studio untuk melihat data:

```bash
pnpm db:studio
```

Browser akan otomatis membuka `http://localhost:5555` dengan Prisma Studio.

Cek tabel:
- ✅ `users` - harus ada 3 users
- ✅ `items` - harus ada 5 items
- ✅ `daily_schedules` - harus ada sample data
- ✅ `fg_stocks` - harus ada sample data
- ✅ `wips` - harus ada sample data

### 8️⃣ Start Backend API

Buka terminal baru:

```bash
pnpm dev:api
```

**Output yang diharapkan:**

```
✅ Redis connected

🚀 PDITS API Server is running!

📍 URL: http://localhost:3001
🏥 Health: http://localhost:3001/api/v1/health
📚 Docs: http://localhost:3001/api/v1/docs
🌍 Environment: development
```

Test API dengan browser atau curl:

```bash
# Browser: buka http://localhost:3001/api/v1/health

# Atau dengan curl:
curl http://localhost:3001/api/v1/health
```

Response yang diharapkan:

```json
{
  "status": "ok",
  "timestamp": "2026-05-12T...",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

### 9️⃣ Start Frontend (Coming Soon)

Frontend akan disetup di langkah berikutnya. Untuk saat ini, backend API sudah siap digunakan.

## ✅ Verification Checklist

Pastikan semua ini berjalan:

- [ ] Docker containers running (`docker-compose ps`)
- [ ] MySQL accessible (Prisma Studio bisa connect)
- [ ] Redis accessible (API health check success)
- [ ] Backend API running di http://localhost:3001
- [ ] Health check returns `status: "ok"`
- [ ] Prisma Studio shows seeded data

## 🔧 Useful Commands

### Database

```bash
# Open Prisma Studio (GUI untuk database)
pnpm db:studio

# Create new migration
pnpm db:migrate

# Reset database (⚠️ HAPUS SEMUA DATA!)
pnpm --filter @pdits/api prisma migrate reset

# Seed database lagi
pnpm --filter @pdits/api prisma:seed
```

### Docker

```bash
# Start containers
docker-compose up -d

# Stop containers
docker-compose down

# Stop dan hapus volumes (⚠️ HAPUS DATA!)
docker-compose down -v

# View logs
docker-compose logs -f mysql
docker-compose logs -f redis

# Restart containers
docker-compose restart
```

### Development

```bash
# Start backend only
pnpm dev:api

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint
```

## 🐛 Troubleshooting

### Problem: "Port 3306 already in use"

**Solution:**

1. Stop MySQL service yang sudah running:
   - Windows: Services → MySQL → Stop
   - Mac: `brew services stop mysql`
   - Linux: `sudo systemctl stop mysql`

2. Atau edit `docker-compose.yml` untuk menggunakan port lain:
   ```yaml
   ports:
     - "3307:3306"  # Ganti 3306 menjadi 3307
   ```
   
   Lalu update `DATABASE_URL` di `.env`:
   ```
   DATABASE_URL=mysql://pdits:devpassword@localhost:3307/pdits_dev
   ```

### Problem: "Cannot connect to MySQL"

**Solution:**

1. Cek container status:
   ```bash
   docker-compose ps
   ```

2. Cek logs:
   ```bash
   docker-compose logs mysql
   ```

3. Restart container:
   ```bash
   docker-compose restart mysql
   ```

4. Tunggu beberapa detik hingga MySQL fully started (cek health check)

### Problem: "Prisma Client not generated"

**Solution:**

```bash
pnpm --filter @pdits/api prisma:generate
```

### Problem: "Module not found" errors

**Solution:**

```bash
# Clean install
rm -rf node_modules
rm pnpm-lock.yaml
pnpm install
```

## 📚 Next Steps

Setelah setup berhasil:

1. ✅ Explore API dengan Prisma Studio
2. ✅ Test API endpoints dengan Postman/Thunder Client
3. ✅ Lanjut ke setup Frontend (akan dibuat selanjutnya)
4. ✅ Baca dokumentasi di `PDITS_TechStack.md` dan `PDITS_UserFlow.md`

## 🆘 Need Help?

Jika mengalami masalah:

1. Cek logs: `docker-compose logs -f`
2. Cek health check: `curl http://localhost:3001/api/v1/health`
3. Restart semua: `docker-compose restart && pnpm dev:api`
4. Create issue di repository

---

**Happy Coding! 🚀**
