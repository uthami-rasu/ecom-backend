import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MailService } from '../mail/mail.service.js';

export interface StoreSettings {
  // General Information
  storeName: string;
  storeLogo?: string;
  favicon?: string;
  contactEmail: string;
  phone: string;
  storeAddress: string;

  // Business Registration
  taxId: string;
  registrationDetails: string;
  currency: string;
  timeZone: string;

  // Shipping & Logistics
  standardDeliveryCharge: number;
  freeDeliveryThreshold: number;
  deliveryRegions: string[];

  // Tax Configuration
  enableTax: boolean;
  defaultTaxRate: number;
  productPriceType: 'inclusive' | 'exclusive';

  // Order Settings
  minOrderValue: number;
  maxOrderValue: number;
  allowCod: boolean;
  cancellationWindowMinutes: number;

  // Payment Methods
  paymentMethods: {
    upi: boolean;
    card: boolean;
    netBanking: boolean;
    cod: boolean;
  };

  // Email & SMTP Configuration
  mail: {
    host: string;
    port: number;
    user?: string;
    password?: string;
    from: string;
    secure: boolean;
  };
}

const DEFAULT_SETTINGS: StoreSettings = {
  storeName: 'NutriSelect Premium Nuts & Fruits',
  storeLogo: '',
  favicon: '',
  contactEmail: 'hello@nutriselect.com',
  phone: '+1 (555) 000-1234',
  storeAddress: '123 Organic Lane, Green Valley, CA 90210, United States',

  taxId: 'GSTIN22AAAAA0000A1Z5',
  registrationDetails: 'Registered as NutriSelect Private Limited under California Trade Act 2021.',
  currency: 'USD ($)',
  timeZone: '(GMT-08:00) Pacific Time (US & Canada)',

  standardDeliveryCharge: 5.0,
  freeDeliveryThreshold: 50.0,
  deliveryRegions: ['California', 'Oregon', 'Washington', 'Nevada'],

  enableTax: true,
  defaultTaxRate: 18,
  productPriceType: 'inclusive',

  minOrderValue: 20,
  maxOrderValue: 1000,
  allowCod: true,
  cancellationWindowMinutes: 30,

  paymentMethods: {
    upi: true,
    card: true,
    netBanking: false,
    cod: true,
  },

  mail: {
    host: 'localhost',
    port: 1025,
    user: '',
    password: '',
    from: 'NutriStock <no-reply@nutristock.local>',
    secure: false,
  },
};

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private readonly filePath = path.resolve(process.cwd(), 'data', 'store-settings.json');
  private settings: StoreSettings = { ...DEFAULT_SETTINGS };

  constructor(private readonly mailService: MailService) {}

  async onModuleInit() {
    await this.loadSettings();
  }

  private async loadSettings() {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
      this.logger.log('Loaded store settings from persistent storage');

      // Sync mail settings to MailService
      if (this.settings.mail) {
        this.mailService.setSmtpConfig({
          transport: 'smtp',
          host: this.settings.mail.host,
          port: this.settings.mail.port,
          user: this.settings.mail.user || undefined,
          password: this.settings.mail.password || undefined,
          secure: this.settings.mail.secure,
          from: this.settings.mail.from,
        });
      }
    } catch {
      // If file doesn't exist, use default and current MailService config
      const initialMail = this.mailService.getSmtpConfig();
      if (initialMail.host) this.settings.mail.host = initialMail.host;
      if (initialMail.port) this.settings.mail.port = initialMail.port;
      if (initialMail.from) this.settings.mail.from = initialMail.from;
      if (initialMail.user) this.settings.mail.user = initialMail.user;
    }
  }

  async getSettings(): Promise<StoreSettings> {
    return { ...this.settings };
  }

  async updateSettings(patch: Partial<StoreSettings>): Promise<StoreSettings> {
    this.settings = {
      ...this.settings,
      ...patch,
      paymentMethods: {
        ...this.settings.paymentMethods,
        ...(patch.paymentMethods ?? {}),
      },
      mail: {
        ...this.settings.mail,
        ...(patch.mail ?? {}),
      },
    };

    // If mail settings updated, apply immediately to MailService
    if (patch.mail) {
      this.mailService.setSmtpConfig({
        transport: 'smtp',
        host: this.settings.mail.host,
        port: Number(this.settings.mail.port),
        user: this.settings.mail.user || undefined,
        password: this.settings.mail.password || undefined,
        secure: Boolean(this.settings.mail.secure),
        from: this.settings.mail.from,
      });
      this.logger.log(`SMTP settings updated from Admin Panel: ${this.settings.mail.host}:${this.settings.mail.port}`);
    }

    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8');
    } catch (err) {
      this.logger.warn(`Could not persist settings to file: ${String(err)}`);
    }

    return { ...this.settings };
  }

  async sendTestEmail(to: string): Promise<{ success: boolean; message: string }> {
    await this.mailService.sendTestMail(to);
    return {
      success: true,
      message: `Test email sent successfully to ${to} via ${this.settings.mail.host}:${this.settings.mail.port}`,
    };
  }
}
