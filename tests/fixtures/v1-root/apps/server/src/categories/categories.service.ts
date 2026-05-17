import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,

    private readonly usersService: UsersService,
  ) {}

  async create(userId: User['id'], createCategoryDto: CreateCategoryDto) {
    const existingCategory = await this.categoryRepository.findOne({
      where: {
        name: createCategoryDto.name,
        user: { id: userId },
      },
    });

    if (existingCategory) {
      throw new ConflictException(`Category with name ${createCategoryDto.name} already exists`);
    }

    return this.categoryRepository.save({
      ...createCategoryDto,
      user: { id: userId },
    });
  }

  async findAll(userId: User['id']) {
    return this.categoryRepository.find({
      where: {
        user: {
          id: userId,
        },
      },
      order: { createdAt: 'ASC' },
    });
  }

  async findAllByUsername(username: User['username']) {
    const user = await this.usersService.findOneByUsername(username);

    if (!user) throw new NotFoundException('User does not exist');
    if (!user?.isPublic) throw new ForbiddenException("This user's profile is private");

    return this.categoryRepository.find({
      where: {
        user: {
          id: user.id,
        },
      },
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(categoryId: Category['id']) {
    const category = await this.categoryRepository.findOne({
      where: {
        id: categoryId,
      },
    });
    if (!category) throw new NotFoundException(`Category with id ${categoryId} not found`);
    return category;
  }

  async findOneByName(categoryName: Category['name'], userId: User['id']) {
    const category = await this.categoryRepository.findOne({
      where: { name: categoryName, user: { id: userId } },
    });
    if (!category) throw new NotFoundException(`Category with name ${categoryName} not found`);
    return category;
  }

  async update(userId: User['id'], categoryId: Category['id'], updateCategoryDto: UpdateCategoryDto) {
    const category = await this.findOne(categoryId);

    if (category.user.id !== userId) {
      throw new ForbiddenException("This category doesn't belong to this user");
    }

    return this.categoryRepository.update(categoryId, {
      ...updateCategoryDto,
    });
  }

  async remove(userId: User['id'], categoryId: Category['id']) {
    const category = await this.findOne(categoryId);

    if (category.user.id !== userId) {
      throw new ForbiddenException("This category doesn't belong to this user");
    }

    return this.categoryRepository.delete(categoryId);
  }
}
