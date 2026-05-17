import { IsEmail, IsNotEmpty, IsOptional, IsString, IsStrongPassword, IsUrl, MinLength } from 'class-validator';

export class SignUpDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @IsStrongPassword()
  password: string;

  @IsUrl()
  @IsOptional()
  picture?: string;
}
