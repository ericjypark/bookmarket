import { Controller, Post, Body } from '@nestjs/common';
import { Auth } from 'src/iam/authentication/decorators/auth.decorator';
import { GoogleAuthenticationService } from './google-authentication.service';
import { AuthType } from '../enums/auth-type.enum';
import { OAuthTokenDto } from '../dto/oauth-token.dto';

@Controller('authentication/google')
@Auth(AuthType.None)
export class GoogleAuthenticationController {
  constructor(private readonly googleAuthenticationService: GoogleAuthenticationService) {}

  @Post()
  authenticate(@Body() googleTokenDto: OAuthTokenDto) {
    return this.googleAuthenticationService.authenticate(googleTokenDto);
  }
}
