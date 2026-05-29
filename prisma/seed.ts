import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Define resources and actions
  const resources = ['user', 'role', 'permission', 'product', 'order'];
  const actions = ['read', 'create', 'update', 'delete', 'approve', 'reject', 'export', 'import', 'print'];

  const permissionsToCreate: any[] = [];
  for (const resource of resources) {
    for (const action of actions) {
      const name = `${resource}:${action}`;
      permissionsToCreate.push({
        name,
        resource,
        action,
        description: `Allows ${action} action on ${resource} resource`,
      });
    }
  }

  console.log(`Creating ${permissionsToCreate.length} permissions...`);
  const seededPermissions: any[] = [];
  for (const perm of permissionsToCreate) {
    const createdPerm = await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: perm,
    });
    seededPermissions.push(createdPerm);
  }
  console.log('✓ Permissions seeded.');

  // 2. Create Superadmin role
  console.log('Creating "Superadmin" role...');
  const superadminRole = await prisma.role.upsert({
    where: { name: 'Superadmin' },
    update: {},
    create: {
      name: 'Superadmin',
      description: 'System Administrator with full access rights',
    },
  });

  // Link all permissions to Superadmin
  console.log('Mapping all permissions to "Superadmin" role...');
  for (const perm of seededPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        role_id_permission_id: {
          role_id: superadminRole.id,
          permission_id: perm.id,
        },
      },
      update: {},
      create: {
        role_id: superadminRole.id,
        permission_id: perm.id,
      },
    });
  }
  console.log('✓ "Superadmin" role and permissions linked.');

  // 3. Create Manager role
  console.log('Creating "Manager" role...');
  const managerRole = await prisma.role.upsert({
    where: { name: 'Manager' },
    update: {},
    create: {
      name: 'Manager',
      description: 'Managerial staff with standard operational access',
    },
  });

  // Map some subset of permissions to Manager
  const managerPermissionNames = [
    'product:read', 'product:create', 'product:update',
    'order:read', 'order:create', 'order:update', 'order:approve',
    'user:read',
  ];
  console.log('Mapping operational permissions to "Manager" role...');
  for (const perm of seededPermissions) {
    if (managerPermissionNames.includes(perm.name)) {
      await prisma.rolePermission.upsert({
        where: {
          role_id_permission_id: {
            role_id: managerRole.id,
            permission_id: perm.id,
          },
        },
        update: {},
        create: {
          role_id: managerRole.id,
          permission_id: perm.id,
        },
      });
    }
  }
  console.log('✓ "Manager" role and permissions linked.');

  // 4. Create default superadmin user
  console.log('Creating default Superadmin user...');
  const hashedPassword = await bcrypt.hash('SuperAdmin2026!', 10);
  const superadminUser = await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: {},
    create: {
      username: 'superadmin',
      email: 'superadmin@example.com',
      password: hashedPassword,
      employee_id: 'EMP-00001',
      is_active: true,
    },
  });

  // Link Superadmin role to Superadmin user
  await prisma.userRole.upsert({
    where: {
      user_id_role_id: {
        user_id: superadminUser.id,
        role_id: superadminRole.id,
      },
    },
    update: {},
    create: {
      user_id: superadminUser.id,
      role_id: superadminRole.id,
    },
  });

  console.log('✓ Default Superadmin user linked to role.');

  // 5. Create default manager user
  console.log('Creating default Manager user...');
  const managerPassword = await bcrypt.hash('Manager2026!', 10);
  const managerUser = await prisma.user.upsert({
    where: { username: 'manager1' },
    update: {},
    create: {
      username: 'manager1',
      email: 'manager1@example.com',
      password: managerPassword,
      employee_id: 'EMP-00002',
      is_active: true,
    },
  });

  // Link Manager role to Manager user
  await prisma.userRole.upsert({
    where: {
      user_id_role_id: {
        user_id: managerUser.id,
        role_id: managerRole.id,
      },
    },
    update: {},
    create: {
      user_id: managerUser.id,
      role_id: managerRole.id,
    },
  });

  console.log('✓ Default Manager user linked to role.');
  console.log('🌱 Seeding process complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
