import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../admin.decorator.js';
import { SettingsService, type StoreSettings } from '../settings.service.js';

@ApiTags('Admin · Settings')
@AdminOnly()
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Patch()
  updateSettings(@Body() patch: Partial<StoreSettings>) {
    return this.settingsService.updateSettings(patch);
  }

  @Post('test-email')
  sendTestEmail(@Body('to') to: string) {
    const targetEmail = to || 'test@nutristock.local';
    return this.settingsService.sendTestEmail(targetEmail);
  }
}
