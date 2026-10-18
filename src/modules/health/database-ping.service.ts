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
      'DatabasePingService initialized: keep-alive scheduled every 12 minutes',
    );
    await this.pingDatabase();
    await this.pingSelf();
  }

  /**
   * Pings PostgreSQL and the external backend URL every 12 minutes.
   * Keeps Render free tier containers from spinning down (inactivity threshold is 15m)
   * and prevents PostgreSQL connection pools from timing out.
   */
  @Cron('0 */12 * * * *')
  async handleCron(): Promise<void> {
    await this.pingDatabase();
    await this.pingSelf();
  }

  async pingSelf(): Promise<boolean> {
    const externalUrl =
      process.env.RENDER_EXTERNAL_URL ||
      process.env.PUBLIC_BACKEND_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://bossco-backend.onrender.com'
        : null);

    if (!externalUrl) return false;

    try {
      const url = `${externalUrl.replace(/\/$/, '')}/api/v1/health`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        this.logger.log(
          `Render keep-alive HTTP ping to ${url} succeeded (${res.status})`,
        );
        return true;
      }
      this.logger.warn(
        `Render keep-alive HTTP ping to ${url} returned status ${res.status}`,
      );
      return false;
    } catch (err) {
      this.logger.warn(
        `Render keep-alive HTTP ping failed: ${(err as Error).message}`,
      );
      return false;
    }
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
