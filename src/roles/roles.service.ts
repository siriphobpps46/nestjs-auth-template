import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRoleDto) {
    // Check duplicate name
    const existing = await this.prisma.role.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new BadRequestException(`Role with name "${dto.name}" already exists`);
    }

    // Database transactional creation
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          name: dto.name,
          description: dto.description,
        },
      });

      if (dto.permission_ids && dto.permission_ids.length > 0) {
        await tx.rolePermission.createMany({
          data: dto.permission_ids.map((permId) => ({
            role_id: role.id,
            permission_id: permId,
          })),
        });
      }

      return tx.role.findUnique({
        where: { id: role.id },
        include: {
          role_permissions: {
            include: {
              permission: true,
            },
          },
        },
      });
    });
  }

  async findAll() {
    return this.prisma.role.findMany({
      include: {
        role_permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        role_permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`Role with ID "${id}" not found`);
    }

    return role;
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.findOne(id);

    if (dto.name && dto.name !== role.name) {
      const existing = await this.prisma.role.findUnique({
        where: { name: dto.name },
      });
      if (existing) {
        throw new BadRequestException(`Role with name "${dto.name}" already exists`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          is_active: dto.is_active,
        },
      });

      if (dto.permission_ids !== undefined) {
        // Delete all old permissions for this role
        await tx.rolePermission.deleteMany({
          where: { role_id: id },
        });

        // Insert new ones
        if (dto.permission_ids.length > 0) {
          await tx.rolePermission.createMany({
            data: dto.permission_ids.map((permId) => ({
              role_id: id,
              permission_id: permId,
            })),
          });
        }
      }

      return tx.role.findUnique({
        where: { id },
        include: {
          role_permissions: {
            include: {
              permission: true,
            },
          },
        },
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.role.delete({
      where: { id },
    });
    return { success: true, message: `Role with ID "${id}" successfully deleted` };
  }
}
