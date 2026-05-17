import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data.interface';

@Injectable()
export class CookieAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractAccessTokenFromCookie(request);

    if (!token) {
      throw new UnauthorizedException('No access token provided in cookies');
    }

    try {
      const payload: ActiveUserData = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('JWT_SECRET'),
      });

      request.user = payload;

      return true;
    } catch {
      throw new UnauthorizedException('Invalid token in cookie');
    }
  }

  private extractAccessTokenFromCookie(request: Request): string | undefined {
    return request.cookies?.access_token;
  }
}
