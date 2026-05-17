import { ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomAlphaStringGenerator } from 'src/common/utils/random-alpha-string-generator';
import { SlotsService } from 'src/slots/slots.service';
import { User } from 'src/users/entities/user.entity';
import { AuthProvider } from 'src/users/enums/auth-provider.enum';
import { UsersService } from 'src/users/users.service';
import { jwtConfig } from '../config/jwt.config';
import { USERNAME_MAX_LENGTH } from '../constants/username';
import { HashingService } from '../hashing/hashing.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';

@Injectable()
export class AuthenticationService {
  constructor(
    private readonly usersService: UsersService,
    private readonly slotsService: SlotsService,
    private readonly hashingService: HashingService,
    private readonly jwtService: JwtService,

    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  async signUp(signUpDto: SignUpDto) {
    const existingUser = await this.usersService.findOne(signUpDto.email, AuthProvider.EMAIL);
    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    const slotReserved = await this.slotsService.tryReserveSlot();
    if (!slotReserved) {
      throw new ForbiddenException('No more signup slots available. Maximum of 100 users reached.');
    }

    const hashedPassword = await this.hashingService.hash(signUpDto.password);

    const user = await this.usersService.create({
      email: signUpDto.email,
      password: hashedPassword,
      picture: signUpDto.picture,
      firstName: 'Bookmarket',
      lastName: 'User',
      username: randomAlphaStringGenerator(USERNAME_MAX_LENGTH),
      auth_provider: AuthProvider.EMAIL,
    });

    return this.generateTokens(user);
  }

  async signIn(signInDto: SignInDto) {
    const user = await this.usersService.findOne(signInDto.email, AuthProvider.EMAIL);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isPasswordCorrect = await this.hashingService.compare(
      signInDto.password,
      // if a user is signing in with this method, password always exists
      user.password!,
    );

    if (!isPasswordCorrect) {
      throw new UnauthorizedException('Incorrect credentials provided');
    }

    return this.generateTokens(user);
  }

  async generateTokens(user: User) {
    const [accessToken, refreshToken] = await Promise.all([
      this.signToken(user.id, this.jwtConfiguration.accessTokenTtl),
      this.signToken(user.id, this.jwtConfiguration.refreshTokenTtl),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    try {
      const { id: userId } = await this.jwtService.verifyAsync(refreshTokenDto.refreshToken, {
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
        secret: this.jwtConfiguration.secret,
      });

      const user = await this.usersService.findOneById(userId);

      if (!user) throw new UnauthorizedException('User not found');

      return this.generateTokens(user);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async signToken<T>(userId: string, expiresIn: number, payload?: T) {
    return this.jwtService.signAsync(
      {
        sub: userId,
        id: userId,
        ...payload,
      },
      {
        expiresIn,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
        secret: this.jwtConfiguration.secret,
      },
    );
  }
}
