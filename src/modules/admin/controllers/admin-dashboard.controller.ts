import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../admin.decorator.js';
import { DashboardService } from '../dashboard.service.js';

@ApiTags('Admin · Dashboard')
@AdminOnly()
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  stats() {
    return this.dashboard.getStats();
  }
}
