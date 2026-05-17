import { Bookmark } from 'src/bookmarks/entities/bookmark.entity';
import { BaseEntity } from 'src/common/entities/base.entity';
import { User } from 'src/users/entities/user.entity';
import { Column, Entity, Index, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity()
export class Category extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  @Unique(['name', 'user'])
  name: string;

  @ManyToOne(() => User, user => user.categories, { eager: true })
  user: User;

  @OneToMany(() => Bookmark, bookmark => bookmark.category, {
    cascade: true,
  })
  bookmarks: Bookmark[];
}
