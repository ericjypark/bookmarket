import { Bookmark } from 'src/bookmarks/entities/bookmark.entity';
import { Category } from 'src/categories/entities/category.entity';
import { BaseEntity } from 'src/common/entities/base.entity';
import { USERNAME_MAX_LENGTH } from 'src/iam/constants/username';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuthProvider } from '../enums/auth-provider.enum';

@Entity()
export class User extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column({ nullable: true, unique: true, length: USERNAME_MAX_LENGTH })
  username: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ nullable: true })
  password?: string;

  @Column({ default: true })
  isPublic: boolean;

  @Column({ enum: AuthProvider })
  auth_provider: AuthProvider;

  @Column({ nullable: true })
  google_id?: string;

  @Column({ nullable: true })
  github_id?: string;

  @Column({ nullable: true })
  picture?: string;

  @OneToMany(() => Bookmark, bookmark => bookmark.user)
  bookmarks: Bookmark[];

  @OneToMany(() => Category, category => category.user)
  categories: Category[];
}
