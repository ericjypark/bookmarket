import { Controller, Post, Body } from '@nestjs/common';

import { Auth } from 'src/iam/authentication/decorators/auth.decorator';
import { AuthType } from '../enums/auth-type.enum';
import { OAuthTokenDto } from '../dto/oauth-token.dto';
import { GithubAuthenticationService } from './github-authentication.service';

@Controller('authentication/github')
@Auth(AuthType.None)
export class GithubAuthenticationController {
  constructor(private readonly githubAuthenticationService: GithubAuthenticationService) {}

  @Post()
  authenticate(@Body() oauthTokenDto: OAuthTokenDto) {
    return this.githubAuthenticationService.authenticate(oauthTokenDto);
  }
}
