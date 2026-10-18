import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabasePingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabasePingService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log(
      'DatabasePingService initialized: keep-alive ping scheduled every 15 minutes',
    );
    await this.pingDatabase();
  }

  /**
   * Pings the PostgreSQL database every 15 minutes (0, 15, 30, 45).
   * Keeps idle connections alive on cloud/serverless providers and monitors database health.
   */
  @Cron('0 */15 * * * *')
  async handleCron(): Promise<void> {
    await this.pingDatabase();
  }

  async pingDatabase(): Promise<boolean> {
    const startedAt = Date.now();
    try {
      if (!this.dataSource.isInitialized) {
        this.logger.warn(
          'Database dataSource is not initialized; skipping ping',
        );
        return false;
      }

      await this.dataSource.query('SELECT 1');
      const durationMs = Date.now() - startedAt;
      this.logger.log(
        `PostgreSQL keep-alive ping successful (${durationMs}ms)`,
      );
      return true;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      this.logger.error(
        `PostgreSQL keep-alive ping failed after ${durationMs}ms: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return false;
    }
  }
}
