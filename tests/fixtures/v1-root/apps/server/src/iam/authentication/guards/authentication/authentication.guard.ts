import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AUTH_TYPE_KEY } from '../../decorators/auth.decorator';
import { AuthType } from '../../enums/auth-type.enum';
import { AccessTokenGuard } from '../access-token/access-token.guard';
import { CookieAuthGuard } from '../cookie/cookie.guard';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  private static readonly defaultAuthType = AuthType.Cookie;

  private readonly authTypeGuardMap: Record<AuthType, CanActivate | CanActivate[]> = {
    [AuthType.Bearer]: this.accessTokenGuard,
    [AuthType.Cookie]: this.cookieGuard,
    [AuthType.None]: { canActivate: () => true },
  };

  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokenGuard: AccessTokenGuard,
    private readonly cookieGuard: CookieAuthGuard,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const authTypes = this.reflector.getAllAndOverride<AuthType[]>(AUTH_TYPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [AuthenticationGuard.defaultAuthType];

    const guards = authTypes.map(type => this.authTypeGuardMap[type]).flat();
    let error = new UnauthorizedException();

    // Try to find a guard that allows activation
    const activationResults = await Promise.all(
      guards.map(guard =>
        Promise.resolve(guard.canActivate(context)).catch(err => {
          error = err;
          return false;
        }),
      ),
    );

    if (activationResults.some(result => result === true)) {
      return true;
    }

    throw error;
  }
}
