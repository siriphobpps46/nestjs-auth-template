import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private sanitizeUser(user: any) {
    if (!user) return null;
    const { password, ...sanitized } = user;
    return sanitized;
  }

  async create(dto: CreateUserDto) {
    // Check duplicate username
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existingUsername) {
      throw new BadRequestException(`Username "${dto.username}" is already taken`);
    }

    // Check duplicate email
    if (dto.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new BadRequestException(`Email "${dto.email}" is already registered`);
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Database transactional creation
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          username: dto.username,
          email: dto.email,
          password: hashedPassword,
          employee_id: dto.employee_id,
        },
      });

      if (dto.role_ids && dto.role_ids.length > 0) {
        await tx.userRole.createMany({
          data: dto.role_ids.map((roleId) => ({
            user_id: newUser.id,
            role_id: roleId,
          })),
        });
      }

      return tx.user.findUnique({
        where: { id: newUser.id },
        include: {
          user_roles: {
            include: {
              role: true,
            },
          },
        },
      });
    });

    return this.sanitizeUser(user);
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      where: { deleted_at: null },
      include: {
        user_roles: {
          include: {
            role: true,
          },
        },
      },
      orderBy: { username: 'asc' },
    });

    return users.map((user) => this.sanitizeUser(user));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        user_roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || user.deleted_at) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return this.sanitizeUser(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    // Check if user exists and is not soft deleted
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user || user.deleted_at) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    // Check duplicate username
    if (dto.username && dto.username !== user.username) {
      const existingUsername = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
      if (existingUsername) {
        throw new BadRequestException(`Username "${dto.username}" is already taken`);
      }
    }

    // Check duplicate email
    if (dto.email && dto.email !== user.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new BadRequestException(`Email "${dto.email}" is already registered`);
      }
    }

    let hashedPassword = user.password;
    if (dto.password) {
      hashedPassword = await bcrypt.hash(dto.password, 10);
    }

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          username: dto.username,
          email: dto.email,
          password: hashedPassword,
          employee_id: dto.employee_id,
          is_active: dto.is_active,
        },
      });

      if (dto.role_ids !== undefined) {
        // Delete old roles link
        await tx.userRole.deleteMany({
          where: { user_id: id },
        });

        // Insert new roles link
        if (dto.role_ids.length > 0) {
          await tx.userRole.createMany({
            data: dto.role_ids.map((roleId) => ({
              user_id: id,
              role_id: roleId,
            })),
          });
        }
      }

      return tx.user.findUnique({
        where: { id },
        include: {
          user_roles: {
            include: {
              role: true,
            },
          },
        },
      });
    });

    return this.sanitizeUser(updatedUser);
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user || user.deleted_at) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    // Soft delete
    await this.prisma.user.update({
      where: { id },
      data: {
        deleted_at: new Date(),
        is_active: false,
      },
    });

    return { success: true, message: `User with ID "${id}" soft deleted successfully` };
  }
}
