import { IsString, IsOptional, IsArray, IsUUID, IsBoolean } from 'class-validator';

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  permission_ids?: string[];
}
