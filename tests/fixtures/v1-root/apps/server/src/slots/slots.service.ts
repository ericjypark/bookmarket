import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class SlotsService {
  private readonly MAX_NEW_USERS = 100;

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private dataSource: DataSource,
  ) {}

  async getSlotsRemaining(): Promise<number> {
    const currentUserCount = await this.usersRepository.count();
    const slotsUsed = Math.max(0, currentUserCount);
    const slotsRemaining = Math.max(0, this.MAX_NEW_USERS - slotsUsed);

    return slotsRemaining;
  }

  async canSignUp(): Promise<boolean> {
    const slotsRemaining = await this.getSlotsRemaining();
    return slotsRemaining > 0;
  }

  async tryReserveSlot(): Promise<boolean> {
    return this.dataSource.transaction(async transactionalEntityManager => {
      await transactionalEntityManager.query('SELECT pg_advisory_xact_lock(1)');

      const result = await transactionalEntityManager
        .createQueryBuilder()
        .select('COUNT(*)', 'count')
        .from(User, 'user')
        .getRawOne();

      const currentCount = parseInt(result.count, 10);

      if (currentCount >= this.MAX_NEW_USERS) {
        return false;
      }

      return true;
    });
  }

  async getSlotStatus(): Promise<{ remaining: number; total: number; canSignUp: boolean }> {
    const remaining = await this.getSlotsRemaining();
    return {
      remaining,
      total: this.MAX_NEW_USERS,
      canSignUp: remaining > 0,
    };
  }
}
