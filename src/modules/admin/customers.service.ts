import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { Address } from '../users/entities/address.entity.js';
import { Role } from '../../common/enums/role.enum.js';
import { escapeLike } from '../../common/utils/text.js';

export interface AdminCustomerListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string | null;
  joined: string;
  orders: number;
  spent: number;
  lastOrder: string | null;
  status: 'Active' | 'Inactive';
}

export interface AdminCustomerDetail {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: string;
  status: 'Active' | 'Inactive';
  joined: string;
  totalOrders: number;
  totalSpent: number;
  addresses: Address[];
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    createdAt: string;
    itemsCount: number;
  }>;
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Address) private readonly addresses: Repository<Address>,
  ) {}

  async listCustomers(query: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: AdminCustomerListItem[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    const qb = this.users
      .createQueryBuilder('u')
      .leftJoin(Order, 'o', 'o.user_id = u.id')
      .select([
        'u.id AS id',
        'u.first_name AS "firstName"',
        'u.last_name AS "lastName"',
        'u.display_name AS "displayName"',
        'u.email AS email',
        'u.phone AS phone',
        'u.avatar_url AS "avatarUrl"',
        'u.is_active AS "isActive"',
        'u.created_at AS "createdAt"',
        'COUNT(o.id)::int AS "ordersCount"',
        'COALESCE(SUM(CASE WHEN o.status IN (\'paid\', \'processing\', \'packed\', \'shipped\', \'delivered\') THEN o.total ELSE 0 END), 0)::bigint AS "totalSpent"',
        'MAX(o.created_at) AS "lastOrderDate"',
      ])
      .where('u.role = :role', { role: Role.Customer })
      .groupBy('u.id');

    if (query.search) {
      const term = `%${escapeLike(query.search.toLowerCase())}%`;
      qb.andWhere('(LOWER(u.first_name) LIKE :term OR LOWER(u.last_name) LIKE :term OR LOWER(u.email) LIKE :term OR u.phone LIKE :term)', { term });
    }

    if (query.status === 'active') {
      qb.andWhere('u.is_active = true');
    } else if (query.status === 'inactive') {
      qb.andWhere('u.is_active = false');
    }

    qb.orderBy('u.created_at', 'DESC');

    const totalCount = await this.users
      .createQueryBuilder('u')
      .where('u.role = :role', { role: Role.Customer })
      .andWhere(query.status === 'active' ? 'u.is_active = true' : query.status === 'inactive' ? 'u.is_active = false' : '1=1')
      .getCount();

    qb.offset(offset).limit(limit);

    const rows = await qb.getRawMany();

    const data: AdminCustomerListItem[] = rows.map((r) => {
      const name = (r.displayName || `${r.firstName} ${r.lastName}`).trim() || r.email;
      return {
        id: r.id,
        name,
        email: r.email,
        phone: r.phone || '—',
        avatar: r.avatarUrl,
        joined: new Date(r.createdAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
        orders: Number(r.ordersCount) || 0,
        spent: (Number(r.totalSpent) || 0) / 100, // stored in paise, convert to rupees
        lastOrder: r.lastOrderDate ? new Date(r.lastOrderDate).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never',
        status: r.isActive ? 'Active' : 'Inactive',
      };
    });

    return {
      data,
      meta: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      },
    };
  }

  async getCustomerDetail(id: string): Promise<AdminCustomerDetail> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    const addresses = await this.addresses.find({
      where: { userId: id },
      order: { isDefaultShipping: 'DESC', createdAt: 'DESC' },
    });

    const userOrders = await this.orders.find({
      where: { userId: id },
      relations: { items: true },
      order: { createdAt: 'DESC' },
    });

    const totalSpent = userOrders
      .filter((o) => ['paid', 'processing', 'packed', 'shipped', 'delivered'].includes(o.status))
      .reduce((sum, o) => sum + o.total, 0) / 100;

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      name: (user.displayName || `${user.firstName} ${user.lastName}`).trim() || user.email,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.isActive ? 'Active' : 'Inactive',
      joined: user.createdAt.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
      totalOrders: userOrders.length,
      totalSpent,
      addresses,
      orders: userOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        total: o.total / 100,
        createdAt: o.createdAt.toISOString(),
        itemsCount: o.items?.length || 0,
      })),
    };
  }

  async updateStatus(id: string, isActive: boolean): Promise<{ success: boolean; isActive: boolean }> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Customer not found');
    user.isActive = isActive;
    await this.users.save(user);
    return { success: true, isActive };
  }
}
