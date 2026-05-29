# Auth + Role Permission Stack Analysis & Reusable Prompt (Standard Single-Tenant)

## Part 1: Stack ที่ใช้ใน Project นี้ (Backend Auth Only)

### 🏗️ Core Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Framework** | NestJS | ^11.0.1 | Backend framework (Module/Controller/Service pattern) |
| **Language** | TypeScript | ^5.7.3 | Type safety |
| **ORM** | Prisma | ^6.10.1 | Database access & schema management |
| **Database** | PostgreSQL | — | Primary data store |
| **Cache** | Redis (ioredis) | ^5.6.1 | Permission caching, token version tracking |
| **Package Manager** | pnpm | 10.12.1 | Dependency management |
| **Infrastructure** | Docker / Docker Compose | — | Containerization for local DB & Redis services |

---

### 🔐 Auth Stack

| Library | Version | Purpose |
|---------|---------|---------|
| `@nestjs/jwt` | ^11.0.0 | JWT token signing & verification |
| `@nestjs/passport` | ^11.0.5 | Auth strategy integration (Passport.js) |
| `passport-jwt` | ^4.0.1 | JWT extraction from Bearer token |
| `bcrypt` | ^6.0.0 | Password hashing (salt round = 10) |
| `jsonwebtoken` | ^9.0.2 | Low-level JWT operations |

---

### 📐 Architecture Pattern

```
┌─────────────────────────────────────────────────────────┐
│                    Auth Flow                            │
│                                                         │
│  Login Request                                          │
│       │                                                 │
│       ▼                                                 │
│  AuthController ──▶ AuthService.login()                 │
│       │                  │                              │
│       │        ┌─────────┴──────────┐                   │
│       │        │ validateUser()     │                   │
│       │        │ bcrypt.compare()   │                   │
│       │        └─────────┬──────────┘                   │
│       │                  │                              │
│       │        ┌─────────┴──────────┐                   │
│       │        │ Prisma: fetch      │                   │
│       │        │ user + roles +     │                   │
│       │        │ permissions        │                   │
│       │        └─────────┬──────────┘                   │
│       │                  │                              │
│       │        ┌─────────┴──────────┐                   │
│       │        │ Generate tokens:   │                   │
│       │        │ • Access Token     │                   │
│       │        │ • Refresh Token    │                   │
│       │        └─────────┬──────────┘                   │
│       │                  │                              │
│       │        ┌─────────┴──────────┐                   │
│       │        │ Redis: cache       │                   │
│       │        │ • permissions[]    │                   │
│       │        │ • token_version    │                   │
│       │        └─────────┬──────────┘                   │
│       │                  │                              │
│       ▼                  ▼                              │
│  Response: { access_token, refresh_token, roles, menus }│
└─────────────────────────────────────────────────────────┘
```

---

### 🗄️ Database Schema (ERD)

```mermaid
erDiagram
    User ||--o{ UserRole : has
    User ||--o| UserDetail : has
    User ||--o{ RefreshToken : has
    Role ||--o{ UserRole : has
    Role ||--o{ RolePermission : has
    Permission ||--o{ RolePermission : has

    User {
        uuid id PK
        string username UK
        string email UK
        string password
        int token_version
        boolean is_active
        string employee_id
        datetime deleted_at
    }

    Role {
        uuid id PK
        string name UK
        string description
        boolean is_active
    }

    Permission {
        uuid id PK
        string name UK
        string description
        string resource
        string action
    }

    UserRole {
        string user_id FK
        string role_id FK
    }

    RolePermission {
        string role_id FK
        string permission_id FK
    }

    RefreshToken {
        uuid id PK
        string user_id FK
        string token UK
        datetime expires_at
        boolean is_revoked
    }
```

---

### 🛡️ Protection Layer (Guards + Strategies + Decorators)

| Component | File | Description |
|-----------|------|-------------|
| **JwtStrategy** | `common/strategies/jwt.strategy.ts` | Passport strategy, validates access token + checks token_version cache + checks soft-delete/active status |
| **JwtRefreshStrategy** | `common/strategies/jwt-refresh.strategy.ts` | Validates refresh token type |
| **JwtAuthGuard** | `common/guards/jwt-auth.guard.ts` | AuthGuard('jwt') wrapper |
| **PermissionsGuard** | `common/guards/permissions.guard.ts` | Reads `@Permissions()` metadata, checks user permissions from Redis cache |
| **@Permissions()** | `common/decorators/permission.decorator.ts` | SetMetadata decorator for required permissions |
| **@CurrentUser()** | `common/decorators/current-user.decorator.ts` | Extract JWT payload (request.user) |

### Usage pattern ใน Controller:

```typescript
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  @Permissions('user-management:create')
  @Post()
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: any) { ... }

  @Permissions('user-management:read')
  @Get()
  findAll(@Query() query: PaginationDto, @CurrentUser() user: any) { ... }
}
```

---

### 🔑 Permission Naming Convention

```
{resource}:{action}
```

| Action | ความหมาย |
|--------|----------|
| `read` | ดูข้อมูล (ใช้กำหนด menu access ด้วย) |
| `create` | สร้างข้อมูล |
| `update` | แก้ไขข้อมูล |
| `delete` | ลบข้อมูล |
| `approve` | อนุมัติ |
| `reject` | ปฏิเสธ |
| `export` | ออกรายงาน |
| `import` | นำเข้าข้อมูล |
| `print` | พิมพ์ |

ตัวอย่าง: `product:create`, `sales-order:approve`, `user-management:read`

---

### 🔄 JWT Token Structure

**Access Token payload:**
```json
{
  "sub": "user-uuid",
  "username": "admin",
  "type": "access",
  "iss": "user-uuid",
  "roles": ["admin", "manager"],
  "menus": ["product", "sales-order", "customer"],
  "name": "John Doe",
  "token_version": 1,
  "iat": 1234567890,
  "exp": 1234571490
}
```

**Refresh Token payload:**
```json
{
  "sub": "user-uuid",
  "username": "admin",
  "type": "refresh",
  "iss": "user-uuid"
}
```

---

### 📦 Redis Cache Keys

| Key Pattern | Value | TTL |
|-------------|-------|-----|
| `auth:{userId}:permissions` | `string[]` (permission names) | Same as JWT expiry |
| `auth:{userId}:token_version` | `number` | Same as JWT expiry |

---

### 🔁 Key Features

1. **Dual JWT** — Access token (short-lived) + Refresh token (stored in DB, revokable)
2. **Token Version** — Force-logout by incrementing token_version
3. **Redis Permission Cache** — PermissionsGuard checks Redis instead of DB on every request
4. **Soft Delete** — Users can be soft-deleted (`deleted_at`), JWT strategy blocks them
5. **Permission-based Menu** — Menus derived from permissions with `action === 'read'`

---

---

## Part 2: Reusable Prompt สำหรับสร้าง Auth + Role Permission ในระบบอื่น (ไม่มี Company/Branch + รองรับ Docker)

> [!TIP]
> Copy prompt ด้านล่างนี้ไปใช้กับ AI assistant (เช่น Claude, ChatGPT, Gemini) เพื่อสร้างระบบ Auth + RBAC พื้นฐานที่ไม่ซับซ้อนและรองรับ Docker ทันที

---

### 📋 Prompt Template

````markdown
# Prompt: สร้างระบบ Auth + Role-Based Permission (RBAC) มาตรฐานพร้อม Docker (Single-Tenant / ไม่มี Company หรือ Branch)

## Stack ที่ต้องใช้
- **Framework**: NestJS (TypeScript)
- **ORM**: Prisma
- **Database**: PostgreSQL (Dockerized)
- **Cache**: Redis (ioredis - Dockerized)
- **Auth**: @nestjs/jwt + @nestjs/passport + passport-jwt + bcrypt
- **Validation**: Zod (with nestjs-zod) หรือ class-validator
- **API Docs**: @nestjs/swagger
- **Infrastructure**: Docker & Docker Compose (สำหรับ Database & Redis ในการพัฒนา)

## Docker Setup ที่ต้องการ

สร้างไฟล์ดังต่อไปนี้ที่ Root Directory ของโปรเจกต์:

1. **docker-compose.yml**
   - **postgres**: service สำหรับ PostgreSQL v16 (กำหนด ports "5432:5432" และ healthcheck)
   - **redis**: service สำหรับ Redis v7 Alpine (กำหนด ports "6379:6379", healthcheck และเปิด AOF persistence)
   - **networks**: bridge network ร่วมกัน

2. **Dockerfile**
   - Multi-stage build สำหรับ NestJS (Development และ Production)
   - คัดลอก Prisma schema และรัน `prisma generate` ระหว่างการ build

## Database Schema ที่ต้องการ

สร้าง Prisma Schema ที่มี models ต่อไปนี้:

1. **User** — เก็บข้อมูลผู้ใช้
   - `id` (UUID, auto-generated)
   - `username` (unique, varchar 30)
   - `email` (unique, nullable, varchar 100)
   - `password` (varchar 100, hashed with bcrypt)
   - `token_version` (int, default 1) — สำหรับ force logout
   - `is_active` (boolean, default true)
   - `created_at`, `updated_at`, `deleted_at` (soft delete)
   - Relations: UserRole[], RefreshToken[], UserDetail?

2. **Role** — บทบาทผู้ใช้
   - `id` (UUID), `name` (unique), `description`, `is_active`
   - Relations: UserRole[], RolePermission[]

3. **Permission** — สิทธิ์การใช้งาน
   - `id` (UUID), `name` (unique, format: `{resource}:{action}`)
   - `resource` (varchar) — เช่น 'product', 'order', 'user-management'
   - `action` (varchar) — เช่น 'read', 'create', 'update', 'delete', 'approve'
   - `description`
   - Unique constraint: [resource, action]
   - Relations: RolePermission[]

4. **UserRole** — Junction table (user_id + role_id, unique together)
5. **RolePermission** — Junction table (role_id + permission_id, unique together)
6. **RefreshToken** — เก็บ refresh token
   - `id`, `user_id`, `token` (unique), `expires_at`, `is_revoked`, `created_at`

## Auth Flow ที่ต้องการ

### Login
1. รับ username + password
2. ค้นหา user จาก DB, ตรวจสอบ password ด้วย bcrypt.compare()
3. ตรวจสอบ is_active และ deleted_at
4. ดึง roles + permissions ของ user (nested include ผ่าน Prisma)
5. สร้าง Access Token (JWT) ที่มี payload: `{ sub, username, roles[], menus[], token_version }`
6. สร้าง Refresh Token (JWT แยก secret) + บันทึกลง DB
7. Cache permissions[] และ token_version ลง Redis โดย TTL = JWT expiry time
8. Return: `{ access_token, refresh_token, user, roles, menus }`

### Token Refresh
1. รับ refresh token จาก Authorization header
2. Verify refresh token + ตรวจสอบว่ามีอยู่ใน DB, ยังไม่ revoke, ยังไม่หมดอายุ
3. ดึง user + roles + permissions ใหม่
4. สร้าง access + refresh token ใหม่
5. Revoke refresh token เก่า + บันทึกอันใหม่
6. Update Redis cache

### Logout
1. ลบ refresh tokens ทั้งหมดของ user จาก DB
2. ลบ Redis cache (permissions + token_version) → force invalidation
3. Support force-logout โดยรับ userId

## JWT Strategy (Passport)

สร้าง `JwtStrategy` ที่:
1. Extract token จาก `Authorization: Bearer <token>`
2. Verify ด้วย JWT_SECRET
3. ตรวจสอบ `token_version` จาก Redis cache — ถ้าไม่ match = ถูก force logout
4. ตรวจสอบ user จาก DB ว่ายังไม่ถูก soft-delete และยัง active

## Permission Guard

สร้าง `PermissionsGuard` (CanActivate) ที่:
1. อ่าน required permissions จาก `@Permissions()` decorator (SetMetadata)
2. ถ้าไม่มี required permissions → ผ่าน (public within auth)
3. ดึง permissions จาก Redis cache (`auth:{userId}:permissions`)
4. ตรวจสอบว่า user มี permission ที่ต้องการอย่างน้อย 1 ตัว (OR logic)
5. ถ้าไม่ผ่าน → throw ForbiddenException

## Custom Decorators

1. **@Permissions(...permissions: string[])** — กำหนด permissions ที่ต้องการ
2. **@CurrentUser()** — ดึง JWT payload จาก request.user

## ใช้งานใน Controller แบบนี้:

```typescript
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('products')
export class ProductsController {
  @Permissions('product:read')
  @Get()
  findAll(@CurrentUser() user) { ... }

  @Permissions('product:create')
  @Post()
  create(@Body() dto, @CurrentUser() user) { ... }

  @Permissions('product:update')
  @Patch(':id')
  update(@Param('id') id, @Body() dto, @CurrentUser() user) { ... }

  @Permissions('product:delete')
  @Delete(':id')
  remove(@Param('id') id, @CurrentUser() user) { ... }
}
```

## Seed Script

สร้าง seed script ที่:
1. สร้าง permissions ทั้งหมดจาก resource list × action list
   - Actions: read, create, update, delete, approve, reject, export, import, print
2. สร้าง default roles (admin, manager, etc.)
3. Assign permissions ทั้งหมดให้ admin role
4. สร้าง default admin user + เชื่อม role

## โครงสร้างไฟล์ที่ต้องการ

```
src/
├── auth/
│   ├── auth.controller.ts      # Login, Logout, Refresh endpoints
│   ├── auth.service.ts         # Business logic
│   ├── auth.module.ts          # JWT providers (access + refresh)
│   └── schema/                 # Zod schemas
├── users/
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── users.module.ts
├── roles/
│   ├── roles.controller.ts
│   ├── roles.service.ts
│   └── roles.module.ts
├── permissions/
│   ├── permissions.controller.ts
│   ├── permissions.service.ts
│   └── permissions.module.ts
├── common/
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── permissions.guard.ts
│   ├── strategies/
│   │   ├── jwt.strategy.ts
│   │   └── jwt-refresh.strategy.ts
│   └── decorators/
│       ├── current-user.decorator.ts
│       └── permission.decorator.ts
├── shared/
│   └── redis/
│       ├── redis.module.ts     # @Global module
│       └── redis.service.ts    # get/set/del with JSON serialization
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
├── tools/
│   └── seed.ts
├── app.module.ts
└── main.ts
```

## Environment Variables ที่ต้องใช้

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/auth_db?schema=public
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-access-token-secret
JWT_EXPIRES_IN=1h
JWT_REFRESH_SECRET=your-refresh-token-secret
JWT_REFRESH_EXPIRES_IN=15d
PORT=3000
```

## ข้อกำหนดเพิ่มเติม
- ใช้ UUID เป็น primary key ทุก table
- Password hash ด้วย bcrypt (salt round = 10)
- ใช้ Dual JWT (access + refresh) แยก secret
- Redis ต้องเป็น Global module (@Global)
- Prisma ต้องเป็น Global module
- Support soft delete (deleted_at) สำหรับ User
- Permission format: `{resource}:{action}` เช่น `product:create`
- Menus สำหรับ frontend derive จาก permissions ที่ action = 'read'
````

---

---

## Part 3: ลำดับขั้นตอนการพัฒนา (Implementation Roadmap)

> [!IMPORTANT]
> เพื่อการพัฒนาที่ลื่นไหลและไม่มีปัญหาเรื่องวงจรอ้างอิง (Circular Dependencies) แนะนำให้สั่ง AI หรือพัฒนาตามลำดับความขึ้นต่อกันของโค้ด (Dependency Order) ดังนี้:

### 🏁 Phase 0: Infrastructure & Configuration (เตรียมสภาพแวดล้อมระบบ)
*   **Step 1**: สร้างไฟล์ `docker-compose.yml` เพื่อบรรจุ PostgreSQL และ Redis
*   **Step 2**: รันคำสั่ง `docker compose up -d` เพื่อให้ฐานข้อมูลและแคชพร้อมทำงานบนเครื่อง
*   **Step 3**: สร้างไฟล์ Dockerfile และ `.env` สำหรับตั้งค่าตัวแปรสิ่งแวดล้อม
*   *ผลลัพธ์ด่านนี้*: Container ฐานข้อมูลและแคชออนไลน์เรียบร้อย

### 🏁 Phase 1: Database & Shared Foundation (ฐานข้อมูลและส่วนกลาง)
*   **Step 4**: นำไฟล์ `schema.prisma` ไปใส่และรันคำสั่ง Migration (`npx prisma migrate dev --name init`) เพื่อสร้างตารางทั้งหมดในฐานข้อมูล
*   **Step 5**: สร้าง **Prisma Module & Service** (Global) เพื่อเชื่อมต่อกับ Database
*   **Step 6**: สร้าง **Redis Module & Service** (Global) เพื่อใช้ในการเก็บ Cache โดยเชื่อมต่อด้วย `ioredis`
*   *ผลลัพธ์ด่านนี้*: NestJS สามารถต่อเข้ากับ DB และ Redis ใน Docker ได้สำเร็จ

### 🛡️ Phase 2: Common Guards, Strategies & Decorators (โครงสร้างความปลอดภัย)
*   **Step 7**: สร้าง Decorators: `@CurrentUser()` และ `@Permissions()`
*   **Step 8**: สร้าง Strategies: `JwtStrategy` (เชื่อมต่อ Redis ตรวจสอบ `token_version` และสถานะ active ของ User) และ `JwtRefreshStrategy`
*   **Step 9**: สร้าง Guards: `JwtAuthGuard` และ `PermissionsGuard` (สกัดสิทธิ์จากแคชของ Redis มาตรวจสอบ)
*   *ผลลัพธ์ด่านนี้*: ระบบรักษาความปลอดภัยพื้นฐานพร้อมใช้งาน

### 🔑 Phase 3: Core Domain Modules (จัดการ User, Role, Permission)
*   **Step 10**: สร้าง **Permissions Module** (มี Service ดึงสิทธิ์ทั้งหมดมาให้เลือกใช้)
*   **Step 11**: สร้าง **Roles Module** (มี CRUD ในการจัดการบทบาท และผูกสิทธิ์ RolePermission)
*   **Step 12**: สร้าง **Users Module** (มีระบบสมัครสมาชิก/สร้าง User ใหม่ และผูกสิทธิ์ UserRole)
*   *ผลลัพธ์ด่านนี้*: ตารางหลักใน DB มีข้อมูลและสามารถตั้งค่าสิทธิ์ผ่าน REST APIs ได้แล้ว

### 🔓 Phase 4: Main Auth Engine (ระบบเข้าสู่ระบบ)
*   **Step 13**: สร้าง **Auth Module & Service** ที่รับผิดชอบเรื่อง Login, Token Refresh, Save/Revoke RefreshToken, และการ Sync ข้อมูลลง Redis Cache ตอนเข้าสู่ระบบ
*   **Step 14**: สร้าง **Auth Controller** สำหรับ Endpoint `/login`, `/logout`, `/refresh`
*   *ผลลัพธ์ด่านนี้*: ยืนยันตัวตนได้จริง ออก Token ได้ และจัดการ Session ได้สมบูรณ์

### 🌱 Phase 5: Seed & Testing (จำลองข้อมูลทดสอบ)
*   **Step 15**: เขียน **Seed Script** (`tools/seed.ts`) เพื่อจำลองสิทธิ์การใช้งานทั้งหมด (CRUD ของทุกโมดูล) และสร้าง Superadmin Account
*   **Step 16**: รันคำสั่ง `npx prisma db seed` และเปิดทดสอบ endpoints ทั้งหมดผ่าน Swagger
*   *ผลลัพธ์ด่านสุดท้าย*: ระบบพร้อมขึ้นสายการผลิตและเชื่อมต่อกับ Frontend!

---

---

## Part 4: คำสั่งการติดตั้ง Dependencies & การตั้งค่าเริ่มต้น

### 1. ติดตั้ง NestJS CLI และสร้างโปรเจกต์ใหม่
```bash
# ติดตั้ง NestJS CLI แบบ Global (ถ้ายังไม่มี)
npm i -g @nestjs/cli

# สร้างโปรเจกต์ NestJS ใหม่
nest new my-auth-service
# เลือก Package Manager ที่ต้องการ (แนะนำ pnpm หรือ npm)
```

### 2. ติดตั้ง Dependencies ที่จำเป็นทั้งหมด
เลือกชุดคำสั่งตาม Package Manager ที่ใช้งานในโปรเจกต์:

#### สำหรับ **pnpm** (แนะนำ):
```bash
# ติดตั้ง Core Auth, JWT & Redis
pnpm add @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt ioredis @nestjs/config

# ติดตั้ง Prisma ORM
pnpm add @prisma/client
pnpm add -D prisma

# ติดตั้ง Types & Development tools
pnpm add -D @types/bcrypt @types/passport-jwt @types/node ts-node

# (ตัวเลือกเพิ่มเติม) ติดตั้ง Validation ด้วย Zod
pnpm add zod nestjs-zod @nestjs/swagger
```

#### สำหรับ **npm**:
```bash
# ติดตั้ง Core Auth, JWT & Redis
npm install @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt ioredis @nestjs/config

# ติดตั้ง Prisma ORM
npm install @prisma/client
npm install --save-dev prisma

# ติดตั้ง Types & Development tools
npm install --save-dev @types/bcrypt @types/passport-jwt @types/node ts-node

# (ตัวเลือกเพิ่มเติม) ติดตั้ง Validation ด้วย Zod
npm install zod nestjs-zod @nestjs/swagger
```

### 3. เริ่มต้นใช้งาน Prisma (Initialize Prisma)
รันคำสั่งด้านล่างในโฟลเดอร์โปรเจกต์ เพื่อสร้างโฟลเดอร์ `prisma` และไฟล์ `schema.prisma`:
```bash
npx prisma init
```
*(จากนั้นนำ Prisma schema ที่ AI สร้างให้ไปใส่ทับในไฟล์ `prisma/schema.prisma` ได้เลย)*

---

### 💡 Part 5: ข้อสังเกตและรายการปรับปรุงระดับ Enterprise (Enterprise Optimization Notes)

เมื่อนำสถาปัตยกรรมนี้ไปอิมพลีเมนต์จริง มีจุดสำคัญระดับ Enterprise ที่ได้รับการปรับปรุงขึ้นเพื่อเพิ่มความเสถียรและความพร้อมใช้งานในโปรดักชัน (Production-Ready) ดังนี้:

#### 1. การรับประกันความไม่ซ้ำกันของ Token ด้วย `jti` (JWT ID)
* **ปัญหา**: ในการทำงานจริงที่มีความเร็วสูง หรือในระบบรันเทสต์อัตโนมัติ (เช่น Login แล้วสั่ง Refresh ทันทีในเสี้ยววินาทีเดียวกัน) ค่า `iat` (Issued At) ของ JWT ซึ่งเก็บเป็นวินาทีจะเท่ากัน หากข้อมูลผู้ใช้เหมือนเดิม จะทำให้ค่า Signature และตัว Refresh Token เหมือนกัน 100% ส่งผลให้ฐานข้อมูลเกิดข้อผิดพลาด **Unique Constraint Violation** (`P2002`) ในตาราง `RefreshToken` ทันที
* **การแก้ไข**: ใส่ฟิลด์ `jti` ที่เป็นค่า Unique String (เช่น ผสมตัวเลขสุ่มกับหน่วยเวลาเป็นมิลลิวินาที: `Math.random().toString(36).substring(2) + Date.now().toString(36)`) ลงใน Payload ของ Refresh Token เสมอ เพื่อให้ตัวอักษรของ Token ที่ออกมีความเป็นเอกลักษณ์ 100% แม้จะถูกสร้างในวินาทีเดียวกัน

#### 2. ระบบกู้คืนแคชสิทธิ์อัตโนมัติ (Self-Healing Cache Fallback)
* **ปัญหา**: หากเซิร์ฟเวอร์ Redis มีการรีสตาร์ท, คีย์หมดอายุ หรือเกิดหน่วยความจำเต็มจนทำการล้างคีย์ (Cache Eviction) ไปก่อนที่ Access Token ของผู้ใช้จะหมดอายุ ผู้ใช้งานจะเจอกล่องข้อความปฏิเสธสิทธิ์ (`ForbiddenException`) ทันทีเนื่องจากโมดูลความปลอดภัยหาแคชไม่พบ
* **การแก้ไข**: เขียนกลไกการดึงข้อมูลสิทธิ์ใน `PermissionsGuard` ให้เป็นแบบ **Self-Healing** หากหาใน Redis ไม่พบ ระบบจะไม่ปฏิเสธการเข้าถึงทันที แต่จะดึงรายชื่อบทบาทและสิทธิ์ล่าสุดของ User จากตาราง SQL ใน Postgres ขึ้นมาเขียนแคชและอัปเดตลง Redis คืนให้โดยอัตโนมัติ

#### 3. ความเข้ากันได้ของเวอร์ชัน Prisma ORM (v6 vs v7)
* **ข้อกำหนด**: ในโปรเจกต์นี้ตรึงเวอร์ชันของ Prisma ไว้ที่ `v6.10.1` เนื่องจากใน Prisma `v7.x` เป็นต้นไป มีการถอดการสนับสนุนโครงสร้างระบุ Connection URL บนไฟล์ตรง (`url = env("DATABASE_URL")`) ออกไปเป็นรูปแบบ config ย่อยบน TypeScript หากนำไปประยุกต์ใช้ในอนาคตควรตรึงเวอร์ชัน `v6.x` เพื่อรักษาความง่ายของไฟล์สคีมาเดี่ยว

