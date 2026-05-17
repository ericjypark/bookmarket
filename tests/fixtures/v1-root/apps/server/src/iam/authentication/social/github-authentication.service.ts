import { Injectable } from '@nestjs/common';

import { AuthProvider } from 'src/users/enums/auth-provider.enum';
import { OAuthTokenDto } from '../dto/oauth-token.dto';
import { CommonOAuthService } from './common-oauth-authentication.service';

@Injectable()
export class GithubAuthenticationService {
  constructor(private readonly commonOAuthService: CommonOAuthService) {}

  async authenticate(oauthTokenDto: OAuthTokenDto) {
    return this.commonOAuthService.authenticate(oauthTokenDto, AuthProvider.GITHUB);
  }
}
