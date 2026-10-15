import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, type EntityManager } from 'typeorm';
import type { CreateAddressDto, UpdateAddressDto } from './dto/address.dto.js';
import { Address } from './entities/address.entity.js';

const MAX_ADDRESSES = 20;

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(Address) private readonly addresses: Repository<Address>,
    private readonly dataSource: DataSource,
  ) {}

  list(userId: string): Promise<Address[]> {
    return this.addresses.find({
      where: { userId },
      order: {
        isDefaultShipping: 'DESC',
        isDefaultBilling: 'DESC',
        createdAt: 'ASC',
      },
    });
  }

  /** Ownership is part of the lookup, so other users' addresses are indistinguishable from missing ones. */
  async getOwned(userId: string, id: string): Promise<Address> {
    const address = await this.addresses.findOneBy({ id, userId });
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }

  async create(userId: string, dto: CreateAddressDto): Promise<Address> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Address);
      const count = await repo.countBy({ userId });
      if (count >= MAX_ADDRESSES)
        throw new BadRequestException(
          `You can save up to ${MAX_ADDRESSES} addresses`,
        );
      // The first address becomes the default for both purposes.
      const address = repo.create({
        ...dto,
        userId,
        country: dto.country ?? 'IN',
        isDefaultShipping: dto.isDefaultShipping ?? count === 0,
        isDefaultBilling: dto.isDefaultBilling ?? count === 0,
      });
      await this.clearOtherDefaults(manager, userId, address);
      return repo.save(address);
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAddressDto,
  ): Promise<Address> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Address);
      const address = await repo.findOneBy({ id, userId });
      if (!address) throw new NotFoundException('Address not found');
      Object.assign(address, dto);
      await this.clearOtherDefaults(manager, userId, address);
      return repo.save(address);
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.addresses.delete({ id, userId });
    if (!result.affected) throw new NotFoundException('Address not found');
  }

  private async clearOtherDefaults(
    manager: EntityManager,
    userId: string,
    address: Address,
  ): Promise<void> {
    const qb = () =>
      manager
        .createQueryBuilder()
        .update(Address)
        .where('user_id = :userId', { userId })
        .andWhere('id IS DISTINCT FROM :id', {
          id: address.id ?? null,
        });
    if (address.isDefaultShipping)
      await qb().set({ isDefaultShipping: false }).execute();
    if (address.isDefaultBilling)
      await qb().set({ isDefaultBilling: false }).execute();
  }
}
