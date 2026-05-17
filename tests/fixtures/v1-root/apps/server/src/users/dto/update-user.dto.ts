import { IsString, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @IsString({ message: 'Username must be a string' })
  @MaxLength(12, { message: 'Username cannot exceed 12 characters' })
  username?: string;

  @IsString({ message: 'First name must be a string' })
  @MaxLength(50, { message: 'First name cannot exceed 50 characters' })
  firstName?: string;

  @IsString({ message: 'Last name must be a string' })
  @MaxLength(50, { message: 'Last name cannot exceed 50 characters' })
  lastName?: string;
}
