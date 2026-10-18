import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { DatabasePingService } from './database-ping.service.js';

describe('DatabasePingService', () => {
  it('returns true when database ping succeeds', async () => {
    const queryMock = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const mockDataSource = {
      isInitialized: true,
      query: queryMock,
    } as unknown as DataSource;

    const service = new DatabasePingService(mockDataSource);
    const result = await service.pingDatabase();

    expect(result).toBe(true);
    expect(queryMock).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns false and logs error when query rejects', async () => {
    const queryMock = vi.fn().mockRejectedValue(new Error('Connection terminated'));
    const mockDataSource = {
      isInitialized: true,
      query: queryMock,
    } as unknown as DataSource;

    const service = new DatabasePingService(mockDataSource);
    const result = await service.pingDatabase();

    expect(result).toBe(false);
  });

  it('skips ping and returns false when dataSource is not initialized', async () => {
    const queryMock = vi.fn();
    const mockDataSource = {
      isInitialized: false,
      query: queryMock,
    } as unknown as DataSource;

    const service = new DatabasePingService(mockDataSource);
    const result = await service.pingDatabase();

    expect(result).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('invokes pingDatabase on handleCron and onApplicationBootstrap', async () => {
    const mockDataSource = {
      isInitialized: true,
      query: vi.fn().mockResolvedValue([]),
    } as unknown as DataSource;

    const service = new DatabasePingService(mockDataSource);
    const spy = vi.spyOn(service, 'pingDatabase');

    await service.onApplicationBootstrap();
    await service.handleCron();

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
