import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { toRupees } from '../../common/utils/money.js';
import { OrderStatus } from '../orders/entities/order.entity.js';
import { REVENUE_STATUSES } from '../orders/order-status.js';
import { LOW_STOCK_THRESHOLD } from '../products/product.mapper.js';

export interface DashboardStats {
  totals: {
    products: number;
    activeProducts: number;
    categories: number;
    customers: number;
    orders: number;
  };
  revenue: { allTime: number; last30Days: number; averageOrderValue: number };
  ordersByStatus: Record<OrderStatus, number>;
  salesLast30Days: Array<{ date: string; orders: number; revenue: number }>;
  lowStock: Array<{
    productId: string;
    productName: string;
    variantId: string;
    label: string;
    sku: string;
    stock: number;
  }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: OrderStatus;
    total: number;
    contactEmail: string;
    createdAt: Date;
  }>;
  topProducts: Array<{
    productId: string | null;
    productName: string;
    unitsSold: number;
    revenue: number;
  }>;
}

@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  async getStats(): Promise<DashboardStats> {
    const revenueStatuses = REVENUE_STATUSES as string[];
    const [
      totals,
      revenue,
      statusRows,
      salesRows,
      lowStock,
      recentOrders,
      topProducts,
    ] = await Promise.all([
      this.dataSource.query(`
        SELECT (SELECT COUNT(*) FROM products)::int AS products,
               (SELECT COUNT(*) FROM products WHERE is_active)::int AS "activeProducts",
               (SELECT COUNT(*) FROM categories)::int AS categories,
               (SELECT COUNT(*) FROM users WHERE role = 'customer')::int AS customers,
               (SELECT COUNT(*) FROM orders)::int AS orders`),
      this.dataSource.query(
        `SELECT COALESCE(SUM(total), 0)::bigint AS "allTime",
                COALESCE(SUM(total) FILTER (WHERE created_at >= now() - interval '30 days'), 0)::bigint AS "last30Days",
                COALESCE(AVG(total), 0)::bigint AS "averageOrderValue"
         FROM orders WHERE status::text = ANY($1)`,
        [revenueStatuses],
      ),
      this.dataSource.query(
        `SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status`,
      ),
      this.dataSource.query(
        `SELECT to_char(day, 'YYYY-MM-DD') AS date,
                COUNT(o.id)::int AS orders,
                COALESCE(SUM(o.total), 0)::bigint AS revenue
         FROM generate_series(current_date - 29, current_date, interval '1 day') AS day
         LEFT JOIN orders o ON o.created_at >= day AND o.created_at < day + interval '1 day' AND o.status::text = ANY($1)
         GROUP BY day ORDER BY day`,
        [revenueStatuses],
      ),
      this.dataSource.query(
        `SELECT p.id AS "productId", p.name AS "productName", v.id AS "variantId", v.label, v.sku, v.stock
         FROM product_variants v JOIN products p ON p.id = v.product_id
         WHERE v.is_active AND v.stock <= $1
         ORDER BY v.stock ASC, p.name ASC LIMIT 10`,
        [LOW_STOCK_THRESHOLD],
      ),
      this.dataSource.query(
        `SELECT id, order_number AS "orderNumber", status, total, contact_email AS "contactEmail", created_at AS "createdAt"
         FROM orders ORDER BY created_at DESC LIMIT 5`,
      ),
      this.dataSource.query(
        `SELECT oi.product_id AS "productId", MAX(oi.product_name) AS "productName",
                SUM(oi.quantity)::int AS "unitsSold", SUM(oi.line_total)::bigint AS revenue
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.status::text = ANY($1)
         GROUP BY oi.product_id ORDER BY "unitsSold" DESC LIMIT 5`,
        [revenueStatuses],
      ),
    ]);

    const ordersByStatus = Object.fromEntries(
      Object.values(OrderStatus).map((status) => [status, 0]),
    ) as Record<OrderStatus, number>;
    for (const row of statusRows as Array<{
      status: OrderStatus;
      count: number;
    }>)
      ordersByStatus[row.status] = row.count;

    return {
      totals: totals[0],
      revenue: {
        allTime: toRupees(Number(revenue[0].allTime)),
        last30Days: toRupees(Number(revenue[0].last30Days)),
        averageOrderValue: toRupees(Number(revenue[0].averageOrderValue)),
      },
      ordersByStatus,
      salesLast30Days: salesRows.map(
        (row: { date: string; orders: number; revenue: string }) => ({
          date: row.date,
          orders: row.orders,
          revenue: toRupees(Number(row.revenue)),
        }),
      ),
      lowStock,
      recentOrders: recentOrders.map(
        (row: DashboardStats['recentOrders'][number]) => ({
          ...row,
          total: toRupees(Number(row.total)),
        }),
      ),
      topProducts: topProducts.map(
        (row: {
          productId: string | null;
          productName: string;
          unitsSold: number;
          revenue: string;
        }) => ({
          ...row,
          revenue: toRupees(Number(row.revenue)),
        }),
      ),
    };
  }
}
