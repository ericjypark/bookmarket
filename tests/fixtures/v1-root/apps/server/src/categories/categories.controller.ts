import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Auth } from 'src/iam/authentication/decorators/auth.decorator';
import { AuthType } from 'src/iam/authentication/enums/auth-type.enum';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { User } from 'src/users/entities/user.entity';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Auth(AuthType.Cookie)
  create(@Body() createCategoryDto: CreateCategoryDto, @ActiveUser() user: User) {
    return this.categoriesService.create(user.id, createCategoryDto);
  }

  @Get()
  @Auth(AuthType.Cookie)
  findAll(@ActiveUser() user: User) {
    return this.categoriesService.findAll(user.id);
  }

  @Patch(':id')
  @Auth(AuthType.Cookie)
  update(@ActiveUser() user: User, @Param('id') id: Category['id'], @Body() updateCategoryDto: UpdateCategoryDto) {
    return this.categoriesService.update(user.id, id, updateCategoryDto);
  }

  @Delete(':id')
  @Auth(AuthType.Cookie)
  remove(@ActiveUser() user: User, @Param('id') id: Category['id']) {
    return this.categoriesService.remove(user.id, id);
  }

  @Get('/s/:username')
  @Auth(AuthType.None)
  findAllByUsername(@Param('username') username: User['username']) {
    return this.categoriesService.findAllByUsername(username);
  }
}
