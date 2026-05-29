import { IsString, IsNotEmpty, IsOptional, IsEmail, IsArray, IsUUID, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsOptional()
  employee_id?: string;

  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  role_ids?: string[];
}
