import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SlotsService } from '../../../slots/slots.service';
import { AuthProvider } from '../../../users/enums/auth-provider.enum';
import { UsersService } from '../../../users/users.service';
import { AuthenticationService } from '../authentication.service';
import { OAuthTokenDto } from '../dto/oauth-token.dto';
import { CommonOAuthService } from './common-oauth-authentication.service';

const mockUsersService = {
  findOne: jest.fn(),
  create: jest.fn(),
  updateUser: jest.fn(),
};

const mockSlotsService = {
  tryReserveSlot: jest.fn(),
};

const mockAuthenticationService = {
  generateTokens: jest.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }),
};

describe('CommonOAuthService', () => {
  let service: CommonOAuthService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CommonOAuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: SlotsService, useValue: mockSlotsService },
        { provide: AuthenticationService, useValue: mockAuthenticationService },
      ],
    }).compile();

    service = module.get(CommonOAuthService);
    jest.clearAllMocks();
  });

  const googleDto: OAuthTokenDto = {
    id: 'google-123',
    email: 'test@gmail.com',
    picture: 'https://example.com/pic.jpg',
    firstName: 'John',
    lastName: 'Doe',
  };

  const githubDto: OAuthTokenDto = {
    id: 'github-456',
    email: 'test@github.com',
    firstName: 'Jane',
    lastName: 'Doe',
  };

  describe('new user creation', () => {
    beforeEach(() => {
      mockUsersService.findOne.mockResolvedValue(null);
      mockSlotsService.tryReserveSlot.mockResolvedValue(true);
      mockUsersService.create.mockImplementation(async (dto) => ({ id: 'uuid', ...dto }));
    });

    it('should set google_id when provider is Google', async () => {
      await service.authenticate(googleDto, AuthProvider.GOOGLE);

      const createArg = mockUsersService.create.mock.calls[0][0];
      expect(createArg.google_id).toBe('google-123');
      expect(createArg.github_id).toBeUndefined();
      expect(createArg.auth_provider).toBe(AuthProvider.GOOGLE);
    });

    it('should set github_id when provider is GitHub', async () => {
      await service.authenticate(githubDto, AuthProvider.GITHUB);

      const createArg = mockUsersService.create.mock.calls[0][0];
      expect(createArg.github_id).toBe('github-456');
      expect(createArg.google_id).toBeUndefined();
      expect(createArg.auth_provider).toBe(AuthProvider.GITHUB);
    });

    it('should throw ForbiddenException when no slots available', async () => {
      mockSlotsService.tryReserveSlot.mockResolvedValue(false);

      await expect(service.authenticate(googleDto, AuthProvider.GOOGLE)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('existing user', () => {
    it('should not re-create existing user', async () => {
      const existingUser = {
        id: 'uuid',
        email: 'test@gmail.com',
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
      };
      mockUsersService.findOne.mockResolvedValue(existingUser);

      await service.authenticate(googleDto, AuthProvider.GOOGLE);

      expect(mockUsersService.create).not.toHaveBeenCalled();
      expect(mockAuthenticationService.generateTokens).toHaveBeenCalledWith(existingUser);
    });

    it('should backfill missing firstName and lastName', async () => {
      const existingUser = {
        id: 'uuid',
        email: 'test@gmail.com',
        firstName: null,
        lastName: null,
        username: 'johndoe',
      };
      mockUsersService.findOne.mockResolvedValue(existingUser);

      await service.authenticate(googleDto, AuthProvider.GOOGLE);

      expect(mockUsersService.updateUser).toHaveBeenCalledWith('uuid', {
        firstName: 'John',
        lastName: 'Doe',
      });
    });
  });
});
