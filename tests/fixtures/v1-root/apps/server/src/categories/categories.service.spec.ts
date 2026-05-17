import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from 'src/users/users.service';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';

const mockCategoryRepository = {
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockUsersService = {
  findOneByUsername: jest.fn(),
};

describe('CategoriesService', () => {
  let service: CategoriesService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: getRepositoryToken(Category), useValue: mockCategoryRepository },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get(CategoriesService);
    jest.clearAllMocks();
  });

  describe('findOne', () => {
    it('should return category when found', async () => {
      const category = { id: 'cat-1', name: 'Test', user: { id: 'user-1' } };
      mockCategoryRepository.findOne.mockResolvedValue(category);

      const result = await service.findOne('cat-1');
      expect(result).toEqual(category);
    });

    it('should throw NotFoundException when category not found', async () => {
      mockCategoryRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOneByName', () => {
    it('should return category when found by name', async () => {
      const category = { id: 'cat-1', name: 'Work', user: { id: 'user-1' } };
      mockCategoryRepository.findOne.mockResolvedValue(category);

      const result = await service.findOneByName('Work', 'user-1');
      expect(result).toEqual(category);
    });

    it('should throw NotFoundException when category name not found', async () => {
      mockCategoryRepository.findOne.mockResolvedValue(null);

      await expect(service.findOneByName('Nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
