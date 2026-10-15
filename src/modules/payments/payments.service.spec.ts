import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrderStatus } from '../orders/entities/order.entity.js';
import { PaymentStatus } from './payment.entity.js';
import { PaymentsService } from './payments.service.js';

describe('PaymentsService', () => {
  let payments: Record<string, ReturnType<typeof vi.fn>>;
  let provider: Record<string, ReturnType<typeof vi.fn> | string>;
  let orders: Record<string, ReturnType<typeof vi.fn>>;
  let manager: { getRepository: ReturnType<typeof vi.fn> };
  let lockedPayment: Record<string, unknown>;
  let service: PaymentsService;

  const ownedPaymentQuery = (result: unknown) => {
    const qb = {
      innerJoinAndSelect: () => qb,
      where: () => qb,
      getOne: vi.fn(async () => result),
    };
    return qb;
  };

  beforeEach(() => {
    lockedPayment = {
      id: 'pay-1',
      orderId: 'order-1',
      status: PaymentStatus.Created,
    };
    const paymentRepo = {
      update: vi.fn(),
      save: vi.fn(async (value) => ({
        id: 'pay-new',
        createdAt: new Date(),
        ...value,
      })),
      create: vi.fn((value) => value),
      createQueryBuilder: vi.fn(() => {
        const qb = {
          setLock: () => qb,
          where: () => qb,
          getOneOrFail: vi.fn(async () => lockedPayment),
        };
        return qb;
      }),
    };
    manager = { getRepository: vi.fn(() => paymentRepo) };
    payments = {
      existsBy: vi.fn(async () => false),
      findOneBy: vi.fn(),
      createQueryBuilder: vi.fn(),
    };
    provider = {
      name: 'mock',
      createPaymentOrder: vi.fn(async () => ({
        providerOrderId: 'mock_order_1',
        checkout: { provider: 'mock' },
      })),
      verifyPayment: vi.fn(),
      verifyWebhookSignature: vi.fn(),
      parseWebhookEvent: vi.fn(),
    };
    orders = {
      findOwned: vi.fn(),
      markPaid: vi.fn(),
      markPaymentFailed: vi.fn(),
      reopenForPayment: vi.fn(),
    };
    const dataSource = {
      transaction: vi.fn(async (work: (m: unknown) => unknown) =>
        work(manager),
      ),
    };
    service = new PaymentsService(
      payments as never,
      provider as never,
      orders as never,
      dataSource as never,
    );
  });

  it('refuses to initiate payment for orders that are not payable', async () => {
    orders.findOwned.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.Paid,
    });
    await expect(service.initiate('u1', 'BSC-ABCDEFGH')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses a new attempt while a payment is pending', async () => {
    orders.findOwned.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.PendingPayment,
    });
    payments.existsBy.mockResolvedValue(true);
    await expect(service.initiate('u1', 'BSC-ABCDEFGH')).rejects.toThrow(
      'already being processed',
    );
  });

  it('creates a gateway order for the full order amount', async () => {
    orders.findOwned.mockResolvedValue({
      id: 'order-1',
      orderNumber: 'BSC-ABCDEFGH',
      status: OrderStatus.PaymentFailed,
      total: 31_900,
      currency: 'INR',
    });
    const result = await service.initiate('u1', 'BSC-ABCDEFGH');
    expect(provider.createPaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 31_900, receipt: 'BSC-ABCDEFGH' }),
    );
    expect(orders.reopenForPayment).toHaveBeenCalledWith(manager, 'order-1');
    expect(result).toMatchObject({
      amount: 319,
      status: PaymentStatus.Created,
      checkout: { provider: 'mock' },
    });
  });

  it('404s for payments owned by someone else', async () => {
    payments.createQueryBuilder.mockReturnValue(ownedPaymentQuery(null));
    await expect(
      service.confirm('intruder', 'pay-1', {
        providerPaymentId: 'x',
        signature: 'y',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects invalid signatures without touching state', async () => {
    payments.createQueryBuilder.mockReturnValue(
      ownedPaymentQuery({
        ...lockedPayment,
        providerOrderId: 'o',
        order: { orderNumber: 'BSC-1' },
      }),
    );
    (provider.verifyPayment as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: false,
    });
    await expect(
      service.confirm('u1', 'pay-1', {
        providerPaymentId: 'x',
        signature: 'y',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(orders.markPaid).not.toHaveBeenCalled();
  });

  it('marks the order paid on a verified success', async () => {
    payments.createQueryBuilder.mockReturnValue(
      ownedPaymentQuery({
        ...lockedPayment,
        providerOrderId: 'o',
        order: { orderNumber: 'BSC-1' },
      }),
    );
    (provider.verifyPayment as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: true,
      status: 'succeeded',
    });
    await service.confirm('u1', 'pay-1', {
      providerPaymentId: 'p',
      signature: 's',
    });
    expect(orders.markPaid).toHaveBeenCalledWith(manager, 'order-1');
  });

  it('marks the order payment_failed on a verified failure', async () => {
    payments.createQueryBuilder.mockReturnValue(
      ownedPaymentQuery({
        ...lockedPayment,
        providerOrderId: 'o',
        order: { orderNumber: 'BSC-1' },
      }),
    );
    (provider.verifyPayment as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: true,
      status: 'failed',
      failureReason: 'declined',
    });
    await service.confirm('u1', 'pay-1', {
      providerPaymentId: 'p',
      signature: 's',
    });
    expect(orders.markPaymentFailed).toHaveBeenCalledWith(manager, 'order-1');
  });

  it('never changes a payment that already reached a final state', async () => {
    lockedPayment.status = PaymentStatus.Succeeded;
    payments.findOneBy.mockResolvedValue({ id: 'pay-1' });
    (
      provider.verifyWebhookSignature as ReturnType<typeof vi.fn>
    ).mockReturnValue(true);
    (provider.parseWebhookEvent as ReturnType<typeof vi.fn>).mockReturnValue({
      providerOrderId: 'o',
      providerPaymentId: 'p',
      status: 'failed',
    });
    await service.handleWebhook(Buffer.from('{}'), 'sig');
    expect(orders.markPaymentFailed).not.toHaveBeenCalled();
  });

  it('rejects webhooks with a missing or bad signature', async () => {
    await expect(
      service.handleWebhook(undefined, 'sig'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    (
      provider.verifyWebhookSignature as ReturnType<typeof vi.fn>
    ).mockReturnValue(false);
    await expect(
      service.handleWebhook(Buffer.from('{}'), 'sig'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('acknowledges irrelevant or unknown webhook events', async () => {
    (
      provider.verifyWebhookSignature as ReturnType<typeof vi.fn>
    ).mockReturnValue(true);
    (provider.parseWebhookEvent as ReturnType<typeof vi.fn>).mockReturnValue(
      null,
    );
    await expect(
      service.handleWebhook(Buffer.from('{}'), 'sig'),
    ).resolves.toEqual({ received: true });

    (provider.parseWebhookEvent as ReturnType<typeof vi.fn>).mockReturnValue({
      providerOrderId: 'unknown',
      providerPaymentId: 'p',
      status: 'succeeded',
    });
    payments.findOneBy.mockResolvedValue(null);
    await expect(
      service.handleWebhook(Buffer.from('{}'), 'sig'),
    ).resolves.toEqual({ received: true });
    expect(orders.markPaid).not.toHaveBeenCalled();
  });

  it('rejects malformed webhook JSON', async () => {
    (
      provider.verifyWebhookSignature as ReturnType<typeof vi.fn>
    ).mockReturnValue(true);
    await expect(
      service.handleWebhook(Buffer.from('{not json'), 'sig'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
