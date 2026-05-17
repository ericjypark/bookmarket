import { ForbiddenException, Injectable } from '@nestjs/common';
import { randomAlphaStringGenerator } from 'src/common/utils/random-alpha-string-generator';
import { USERNAME_MAX_LENGTH } from 'src/iam/constants/username';
import { SlotsService } from 'src/slots/slots.service';
import { AuthProvider } from 'src/users/enums/auth-provider.enum';
import { UsersService } from 'src/users/users.service';
import { AuthenticationService } from '../authentication.service';
import { OAuthTokenDto } from '../dto/oauth-token.dto';

@Injectable()
export class CommonOAuthService {
  constructor(
    private readonly authenticationService: AuthenticationService,
    private readonly usersService: UsersService,
    private readonly slotsService: SlotsService,
  ) {}

  async authenticate(oauthTokenDto: OAuthTokenDto, authProvider: AuthProvider) {
    // Match by provider ID first (stable), then fall back to email
    let user = await this.usersService.findOneByProviderId(oauthTokenDto.id, authProvider);
    if (!user) {
      user = await this.usersService.findOne(oauthTokenDto.email, authProvider);
    }

    if (!user) {
      const slotReserved = await this.slotsService.tryReserveSlot();
      if (!slotReserved) {
        throw new ForbiddenException('No more signup slots available. Maximum of 100 users reached.');
      }

      user = await this.usersService.create({
        email: oauthTokenDto.email,
        google_id: authProvider === AuthProvider.GOOGLE ? oauthTokenDto.id : undefined,
        github_id: authProvider === AuthProvider.GITHUB ? oauthTokenDto.id : undefined,
        picture: oauthTokenDto.picture,
        firstName: oauthTokenDto.firstName ?? 'Bookmarket',
        lastName: oauthTokenDto.lastName ?? 'User',
        username: randomAlphaStringGenerator(USERNAME_MAX_LENGTH),
        auth_provider: authProvider,
      });
    } else if (user.email !== oauthTokenDto.email) {
      // Update email if it changed on the OAuth provider
      await this.usersService.updateEmail(user.id, oauthTokenDto.email);
      user.email = oauthTokenDto.email;
    }

    const missingUserInfo: Record<string, string> = {};

    if (!user.firstName) {
      missingUserInfo.firstName = oauthTokenDto.firstName ?? 'Bookmarket';
    }
    if (!user.lastName) {
      missingUserInfo.lastName = oauthTokenDto.lastName ?? 'user';
    }
    if (!user.username) {
      missingUserInfo.username = randomAlphaStringGenerator(USERNAME_MAX_LENGTH);
    }

    if (Object.keys(missingUserInfo).length > 0) {
      await this.usersService.updateUser(user.id, missingUserInfo);
    }

    return this.authenticationService.generateTokens(user);
  }
}
