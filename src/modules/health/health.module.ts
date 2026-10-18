import { Module } from '@nestjs/common';
import { DatabasePingService } from './database-ping.service.js';
import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController],
  providers: [DatabasePingService],
  exports: [DatabasePingService],
})
export class HealthModule {}
