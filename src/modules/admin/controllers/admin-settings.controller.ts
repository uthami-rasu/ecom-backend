import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../admin.decorator.js';
import { SettingsService, type StoreSettings } from '../settings.service.js';
import { ImageUploadService } from '../../storage/image-upload.service.js';

@ApiTags('Admin · Settings')
@AdminOnly()
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly images: ImageUploadService,
  ) {}

  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Patch()
  updateSettings(@Body() patch: Partial<StoreSettings>) {
    return this.settingsService.updateSettings(patch);
  }

  /** Store logo upload — bytes via backend /uploads, URL persisted in DB. */
  @Post('logo')
  @UseInterceptors(FileInterceptor('image'))
  @ApiConsumes('multipart/form-data')
  async uploadLogo(@UploadedFile() file: Express.Multer.File) {
    const stored = await this.images.upload('branding', file);
    return this.settingsService.setBrandImage(
      'logo',
      stored.mediumUrl,
      stored.storageKey,
    );
  }

  /** Favicon upload — bytes via backend /uploads, URL persisted in DB. */
  @Post('favicon')
  @UseInterceptors(FileInterceptor('image'))
  @ApiConsumes('multipart/form-data')
  async uploadFavicon(@UploadedFile() file: Express.Multer.File) {
    const stored = await this.images.upload('branding', file);
    return this.settingsService.setBrandImage(
      'favicon',
      stored.thumbUrl,
      stored.storageKey,
    );
  }

  @Post('test-email')
  sendTestEmail(@Body('to') to: string) {
    const targetEmail = to || 'hello@bossco.local';
    return this.settingsService.sendTestEmail(targetEmail);
  }
}
