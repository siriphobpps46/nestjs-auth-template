# 🎨 คู่มือการเชื่อมต่อระบบหลังบ้านสำหรับ Frontend (Frontend Integration Guide)

คู่มือฉบับนี้เตรียมไว้สำหรับนักพัฒนาฝั่งหน้าบ้าน (Frontend Developer) เช่น **React, Next.js, Vue, Angular หรือ Mobile App** เพื่อทำความเข้าใจวิธีการเชื่อมต่อระบบยืนยันตัวตน (Authentication) และการควบคุมสิทธิ์การเข้าใช้งาน (RBAC) ร่วมกับระบบหลังบ้านของเรา

---

## 📍 ข้อมูลพื้นฐานระบบ (System Info)

* **Base URL**: `http://localhost:3000` (หรือดึงจากไฟล์ `.env` ของหน้าบ้านของคุณ เช่น `process.env.NEXT_PUBLIC_API_URL`)
* **Headers มาตรฐาน**: ต้องแนบ Token ในรูปแบบ Bearer สำหรับทุกเส้นทางที่ถูกป้องกัน:
  ```http
  Authorization: Bearer <access_token>
  ```

---

## 🔐 เส้นทางยืนยันตัวตน (Authentication Endpoints)

### 1. ล็อกอินเข้าสู่ระบบ (Login)
* **Endpoint**: `POST /auth/login`
* **สิทธิ์การเข้าถึง**: สาธารณะ (Public)
* **Request Body**:
  ```json
  {
    "username": "superadmin",
    "password": "SuperAdmin2026!"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "eyJhbGciOi...",
    "roles": ["Superadmin"],
    "menus": ["user", "role", "permission", "product", "order"],
    "user": {
      "id": "f0731d79-71a2-4ec9-b9ad-8384981a045a",
      "username": "superadmin",
      "email": "superadmin@example.com",
      "token_version": 1,
      "is_active": true,
      "employee_id": "EMP-00001",
      "created_at": "2026-05-29T15:48:02.620Z",
      "updated_at": "2026-05-29T15:48:02.620Z",
      "deleted_at": null
    }
  }
  ```
  > [!TIP]
  > **คำแนะนำในการเก็บคีย์**: 
  > * เก็บ `access_token` ไว้ใน Memory/State ของแอป (เช่น React Context, Redux, Zustand)
  > * เก็บ `refresh_token` ไว้ในที่ปลอดภัย เช่น `HttpOnly Cookie` (แนะนำ) หรือ `Secure LocalStorage`

---

### 2. การต่ออายุสิทธิ์ใช้งาน (Token Refresh / Rotation)
ใช้เมื่อ Access Token หมดอายุ เพื่อขอคู่อันใหม่แบบปลอดภัยสูง (ระบบใช้ Dual Rotation ยึดคีย์เก่าทันทีเพื่อป้องกันการเจาะ)
* **Endpoint**: `POST /auth/refresh`
* **Headers**: แนบ Refresh Token ในช่อง Authorization แทนคีย์เก่า
  ```http
  Authorization: Bearer <refresh_token>
  ```
* **Response (200 OK)**: ส่งคีย์ใหม่กลับมาให้แทนที่ทันที
  ```json
  {
    "access_token": "new_access_token_here",
    "refresh_token": "new_refresh_token_here",
    "roles": ["Superadmin"],
    "menus": ["user", "role", "permission", "product", "order"],
    "user": { ... }
  }
  ```

---

### 3. ออกจากระบบ (Logout)
* **Endpoint**: `POST /auth/logout`
* **Headers**: แนบ Access Token มาตามปกติ
* **Request Body**: ต้องส่ง Refresh Token เพื่อไปบล็อกและทำลายสิทธิ์ในฝั่งหลังบ้าน
  ```json
  {
    "refresh_token": "eyJhbGciOi..."
  }
  ```

---

### 4. สั่งบังคับให้ออกจากระบบทันที (Force Logout)
* **Endpoint**: `POST /auth/force-logout/:userId`
* **Headers**: แนบ Access Token ของผู้มีสิทธิ์ระดับสูง
* **สิทธิ์ที่ต้องการ**: `user:update`
* **คำอธิบาย**: บัญชีปลายทางจะถูกตัดเซสชันและบังคับให้ออกจากระบบภายในเสี้ยววินาที

---

## 📁 เส้นทางการเข้าถึงข้อมูล CRUD (Requires Access Token)

ทุกๆ เส้นทางด้านล่างนี้ถูกป้องกันไว้ทั้งหมด หน้าบ้านต้องแนบ Access Token มาใน Header เสมอ:

### 👥 จัดการผู้ใช้ (Users Module)
* `POST /users` (สิทธิ์: `user:create`): สมัครหรือสร้างผู้ใช้ใหม่
* `GET /users` (สิทธิ์: `user:read`): ดึงรายชื่อผู้ใช้ทั้งหมด (กรอง soft delete แล้ว)
* `GET /users/:id` (สิทธิ์: `user:read`): ดึงข้อมูลผู้ใช้รายบุคคล
* `PATCH /users/:id` (สิทธิ์: `user:update`): แก้ไขโปรไฟล์/เปลี่ยนบทบาท/เปลี่ยนรหัสผ่าน
* `DELETE /users/:id` (สิทธิ์: `user:delete`): สั่งซอฟต์ดีลีท (Soft Delete) ผู้ใช้

### 👑 จัดการบทบาทสิทธิ์ (Roles Module)
* `POST /roles` (สิทธิ์: `role:create`): สร้างบทบาทใหม่ พร้อมส่งอาร์เรย์ของ UUID permissions ที่ต้องการผูก
* `GET /roles` (สิทธิ์: `role:read`): ดึงข้อมูลบทบาทและสิทธิ์ที่ผูกอยู่
* `GET /roles/:id` (สิทธิ์: `role:read`): ดึงข้อมูลบทบาทรายบุคคล
* `PATCH /roles/:id` (สิทธิ์: `role:update`): อัปเดตข้อมูลหรือสลับ/แก้ไข permissions ใหม่
* `DELETE /roles/:id` (สิทธิ์: `role:delete`): ลบบทบาทออกจากระบบ

### 🔑 จัดการสิทธิ์การทำงาน (Permissions Module)
* `GET /permissions` (สิทธิ์: `permission:read`): ดึงรายการสิทธิ์ทั้งหมดในฐานข้อมูล (45 สิทธิ์ตั้งต้น) เพื่อนำไปทำหน้าจอ Checkbox ตอนผูกสิทธิ์บทบาท

---

## 💻 คู่มือการเขียนระบบฝั่ง Frontend (Axios Interceptors)

ให้คัดลอกตัวอย่างโค้ด **Axios Interceptor** ด้านล่างนี้ ไปปรับปรุงในโปรเจกต์ฝั่งหน้าบ้านของคุณ โค้ดนี้จะช่วยตรวจจับสถานการณ์เมื่อคีย์ Access Token หมดอายุ (`401 Unauthorized`) แล้วทำหน้าที่ยิงไปต่ออายุ (Refresh) และยิงรีเควสเดิมซ้ำใหม่อัตโนมัติโดยที่ผู้ใช้งานไม่รู้สึกตัวว่าคีย์หลุด:

```typescript
import axios from 'axios';

const API_URL = 'http://localhost:3000';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 1. แนบ Access Token เข้าไปในทุกๆ Request อัตโนมัติ
apiClient.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem('access_token'); // หรือรับจาก State Manager
    if (accessToken && config.headers) {
      config.headers['Authorization'] = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 2. ดักจับเมื่อเจอ Error 401 (คีย์หมดอายุ) เพื่อทำการรีเฟรชอัปเดตคีย์ใหม่ทันที
let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // หากเจอ 401 และยังไม่ได้รันการทำ refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // หากอยู่ในช่วงกำลังรีเฟรชคีย์อยู่ ให้รอก่อนแล้วรันซ้ำเมื่อได้คีย์ใหม่
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        
        // ยิงไปขอ Token คู่ใหม่โดยใช้ Refresh Token
        const response = await axios.post(`${API_URL}/auth/refresh`, {}, {
          headers: { Authorization: `Bearer ${refreshToken}` }
        });

        const { access_token, refresh_token } = response.data;

        // บันทึกคีย์คู่ใหม่ลงไปแทนที่อันเดิม
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);

        isRefreshing = false;
        processQueue(null, access_token);

        // ยิงรีเควสเดิมซ้ำอีกครั้งด้วยคีย์ใหม่
        originalRequest.headers['Authorization'] = `Bearer ${access_token}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        processQueue(refreshError, null);
        
        // หากรีเฟรชล้มเหลว (เช่น Refresh Token หมดอายุ/โดนบล็อก) ให้เคลียร์ค่าแล้วเด้งไปหน้า Login
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
```

---

## 🛠️ วิธีการสร้าง Dynamic Sidebar Menu ในหน้าบ้าน

หลังจากที่ได้ตัวแปรอาร์เรย์ `menus` จากการเข้าสู่ระบบ (เช่น `["user", "role", "product"]`) คุณสามารถเขียนโค้ดตัวอย่างใน React/Next.js ดังนี้เพื่อกรองการแสดงผลแท็บซ้ายมือ:

```tsx
const sidebarItems = [
  { key: 'user', label: 'จัดการข้อมูลผู้ใช้งาน', path: '/users', icon: <UserIcon /> },
  { key: 'role', label: 'จัดการบทบาทและสิทธิ์', path: '/roles', icon: <KeyIcon /> },
  { key: 'product', label: 'คลังข้อมูลสินค้า', path: '/products', icon: <BoxIcon /> },
  { key: 'order', label: 'ใบสั่งซื้อสินค้า', path: '/orders', icon: <CartIcon /> },
];

export function Sidebar() {
  // ดึงค่าเมนูที่เซฟไว้ตอนล็อกอิน
  const userMenus = useAuthStore((state) => state.menus); // array string e.g. ["product", "order"]

  // กรองแสดงผลเฉพาะเมนูที่สิทธิ์ของผู้ใช้คนนั้นอ่านได้จริง
  const visibleItems = sidebarItems.filter(item => userMenus.includes(item.key));

  return (
    <nav>
      {visibleItems.map(item => (
        <a key={item.key} href={item.path}>
          {item.icon}
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}
```
