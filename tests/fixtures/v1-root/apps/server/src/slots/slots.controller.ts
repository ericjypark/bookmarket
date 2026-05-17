import { Controller, Get } from '@nestjs/common';
import { Auth } from 'src/iam/authentication/decorators/auth.decorator';
import { AuthType } from 'src/iam/authentication/enums/auth-type.enum';
import { SlotsService } from './slots.service';

@Controller('slots')
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  @Get('status')
  @Auth(AuthType.None)
  async getSlotStatus() {
    return this.slotsService.getSlotStatus();
  }
}