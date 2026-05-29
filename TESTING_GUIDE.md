# 🚀 คู่มือการทดสอบระบบ Auth + RBAC ด้วย Bash Script (Automated API Testing Guide)

เอกสารฉบับนี้จัดทำขึ้นเพื่อแนะนำวิธีการใช้งานและทำความเข้าใจ **Automated API Testing Suite** ซึ่งเขียนอยู่ในสคริปต์ [test_api.sh](file:///Users/siriphob/Documents/GitHub/Gemini/backend/scripts/test_api.sh) โดยสคริปต์นี้ถูกออกแบบมาเพื่อทำการทดสอบกระบวนการทำธุรกิจ (Business Flow) ของระบบความปลอดภัยและสิทธิ์การใช้งานของ Backend แบบ End-to-End โดยไม่จำเป็นต้องมีหน้ากากระบบฝั่งหน้าบ้าน (Frontend)

---

## 🛠️ รายการสิ่งที่ต้องเตรียมพร้อมก่อนการทดสอบ (Prerequisites)

ก่อนทำการรันสคริปต์ทดสอบ ตรวจสอบให้แน่ใจว่าได้จัดเตรียมสภาพแวดล้อมดังนี้เรียบร้อยแล้ว:

1. **Docker Services Online**: คอนเทนเนอร์ฐานข้อมูล PostgreSQL และแคช Redis ต้องกำลังทำงานอยู่
   ```bash
   docker compose up -d
   ```
2. **Database Migrated & Seeded**: ฐานข้อมูลได้ทำการรัน Migration และรันข้อมูลสิทธิ์ตั้งต้น (45 สิทธิ์ + Superadmin/Manager) เรียบร้อยแล้ว
   ```bash
   npx prisma migrate dev
   npx prisma db seed
   ```
3. **NestJS Server Online**: ตัวเซิร์ฟเวอร์ระบบกำลังทำงานอยู่ใน Background หรือรันบน Terminal เครื่องหลัก
   ```bash
   npm run start:dev
   ```

---

## 🏃 วิธีการรันชุดทดสอบ (How to Run)

เปิดหน้าต่าง Terminal ใหม่ขึ้นมา ไปยังโฟลเดอร์รากของโปรเจกต์ (Root Directory) และเรียกใช้งานชุดทดสอบด้วยคำสั่ง:

```bash
# กำหนดสิทธิ์ให้ระบบอนุญาตรันสคริปต์ได้ (รันเฉพาะรอบแรก)
chmod +x scripts/test_api.sh

# สั่งเริ่มกระบวนการทดสอบ
./scripts/test_api.sh
```

---

## 📊 รายละเอียดขั้นตอนการทดสอบ (API Test Steps)

สคริปต์ทดสอบจะจำลองพฤติกรรมการใช้งานจริงของระบบเป็นขั้นตอนทั้งหมด **7 ขั้นตอนหลัก** พร้อมบันทึกผลลัพธ์การตอบสนอง (HTTP Responses) ออกมาเป็นไฟล์แยกตามโฟลเดอร์ `./test_results/`:

| ลำดับขั้นตอน | รายละเอียดการทดสอบ | สิ่งที่ตรวจสอบในขั้นตอนนี้ | ชื่อไฟล์ผลลัพธ์ |
|:---:|---|---|---|
| **Step 1** | **Login as Superadmin** | ยืนยันตัวตนด้วยบัญชีสิทธิ์ระดับสูงสุด และดึง Access Token + Refresh Token ออกมาใช้งาน | `1_login_response.json` |
| **Step 2** | **Fetch Permissions** | เรียกดูสิทธิ์การใช้งานทั้งหมดในระบบผ่าน Bearer Access Token (จำลองการดึงรายการไปทำหน้าตั้งค่า) | `2_get_permissions.json` |
| **Step 3** | **Create Custom Role** | ทำการสร้างบทบาทแบบสุ่ม (เช่น `Warehouse Operator 675`) และผูกข้อมูลสิทธิ์ของโมดูลสินค้า (Product) เข้าไปด้วยแบบ Transactional | `3_create_role.json` |
| **Step 4** | **Create New User** | ทำการเพิ่ม User ใหม่ในระบบและทำการเชื่อมโยงเข้ากับบทบาทใหม่ใน Step 3 พร้อมแฮชรหัสผ่านด้วย `bcrypt` | `4_create_user.json` |
| **Step 5** | **Login as New User** | จำลองการเข้าระบบของพนักงานที่สร้างใหม่ เพื่อเช็คตัวแปร Access Token, การแยกบทบาท (Roles) และการสร้างเมนูอัตโนมัติเฉพาะตัว (derived menus) | `5_login_new_user.json` |
| **Step 6** | **Refresh Session** | ยิง Endpoint รีเฟรช เพื่อตรวจสอบระบบการหมุนเวียนคีย์ (Token Rotation) ยึดคีย์เก่าและส่งชุดคีย์ใหม่ที่มีอายุการใช้งานเพิ่มขึ้น | `6_refresh_token_response.json` |
| **Step 7** | **Perform Logout** | ยิงเพื่อออกจากระบบ ทำการปิดเซสชันและทำสัญลักษณ์บล็อก (Revoke) ข้อมูลในฐานข้อมูล พร้อมทั้งกวาดล้างคีย์ความปลอดภัยออกจาก Redis Cache ทันที | `7_logout_response.json` |

---

## 💡 จุดเด่นระดับ Enterprise ของระบบจำลองการเทสต์นี้

1. **Randomized Sandbox Suffixes**: สคริปต์จะทำการสร้างรหัสลับแบบสุ่มในทุกรอบของการเทสต์ ทำให้บทบาทและรายชื่อผู้ใช้ที่จำลองเทสต์ไม่ซ้ำซ้อนกันในฐานข้อมูล คุณจึงสามารถเรียกสคริปต์นี้รันกี่รอบก็ได้ตามต้องการโดยไม่ต้องเคลียร์ Database ก่อน
2. **Standard HTTP Compliance Verification**: ผลลัพธ์ในแต่ละข้อจะถูกจัดเก็บเป็นไฟล์ JSON ดิบที่ได้รับจริงจากตัวเซิร์ฟเวอร์ สะท้อนรูปแบบการนำไปเชื่อมต่อกับโปรแกรมภายนอก เช่น React, Vue หรือ Next.js ในอนาคตได้ทันที
3. **Token Sign Uniqueness Check**: มีการทดสอบระบบการสร้าง JWT ที่มีความต่างกันของลายเซ็นแม้จะถูกสร้างในมิลลิวินาทีเดียวกันเพื่อป้องกันไม่ให้ชนข้อจำกัด unique ในเซสชัน

---

## 🔐 บัญชีที่ได้รับการบันทึกข้อมูลและนำไปทดสอบได้เพิ่มเติม (Seeded Accounts)

* **สิทธิ์ผู้ดูแลระบบ (Superadmin Access)**:
  * **Username**: `superadmin`
  * **Password**: `SuperAdmin2026!`
* **สิทธิ์ผู้บริหารทั่วไป (Manager Operational Access)**:
  * **Username**: `manager1`
  * **Password**: `Manager2026!`
