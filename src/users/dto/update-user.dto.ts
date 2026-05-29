import { IsString, IsOptional, IsEmail, IsArray, IsUUID, IsBoolean, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  username?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MinLength(6)
  password?: string;

  @IsString()
  @IsOptional()
  employee_id?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  role_ids?: string[];
}
