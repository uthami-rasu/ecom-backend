import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '../mail/mail.service.js';
import { StoreSetting } from './store-setting.entity.js';

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

  // Email & SMTP Configuration (Gmail SMTP — configured via Admin Panel, stored in DB)
  mail: {
    host: string;
    port: number;
    user?: string;
    password?: string;
    from: string;
    secure: boolean;
  };
}

/** Bossco defaults seeded into the DB on first run — no hardcoded file. */
const DEFAULT_SETTINGS: Omit<StoreSettings, 'storeLogo' | 'favicon'> = {
  storeName: 'Bossco Naturals',
  contactEmail: 'hello@bossco.local',
  phone: '+91 98765 43210',
  storeAddress: 'Bossco Naturals, Kochi, Kerala, India',

  taxId: 'GSTIN32AAAAA0000A1Z5',
  registrationDetails: 'Registered as Bossco Naturals Private Limited.',
  currency: 'INR (₹)',
  timeZone: '(GMT+05:30) India Standard Time',

  standardDeliveryCharge: 49.0,
  freeDeliveryThreshold: 999.0,
  deliveryRegions: ['Kerala', 'Tamil Nadu', 'Karnataka'],

  enableTax: true,
  defaultTaxRate: 18,
  productPriceType: 'inclusive',

  minOrderValue: 0,
  maxOrderValue: 100000,
  allowCod: true,
  cancellationWindowMinutes: 30,

  paymentMethods: {
    upi: true,
    card: true,
    netBanking: true,
    cod: true,
  },

  mail: {
    host: 'smtp.gmail.com',
    port: 587,
    user: '',
    password: '',
    from: 'Bossco Naturals <no-reply@bossco.local>',
    secure: false,
  },
};

function toApi(row: StoreSetting): StoreSettings {
  return {
    storeName: row.storeName,
    storeLogo: row.storeLogoUrl ?? '',
    favicon: row.faviconUrl ?? '',
    contactEmail: row.contactEmail,
    phone: row.phone,
    storeAddress: row.storeAddress,
    taxId: row.taxId,
    registrationDetails: row.registrationDetails,
    currency: row.currency,
    timeZone: row.timeZone,
    standardDeliveryCharge: Number(row.standardDeliveryCharge),
    freeDeliveryThreshold: Number(row.freeDeliveryThreshold),
    deliveryRegions: row.deliveryRegions ?? [],
    enableTax: row.enableTax,
    defaultTaxRate: Number(row.defaultTaxRate),
    productPriceType: row.productPriceType,
    minOrderValue: Number(row.minOrderValue),
    maxOrderValue: Number(row.maxOrderValue),
    allowCod: row.allowCod,
    cancellationWindowMinutes: row.cancellationWindowMinutes,
    paymentMethods: {
      upi: row.paymentUpi,
      card: row.paymentCard,
      netBanking: row.paymentNetBanking,
      cod: row.paymentCod,
    },
    mail: {
      host: row.mailHost,
      port: row.mailPort,
      user: row.mailUser ?? '',
      from: row.mailFrom,
      secure: row.mailSecure,
    },
  };
}

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectRepository(StoreSetting)
    private readonly repo: Repository<StoreSetting>,
    private readonly mailService: MailService,
  ) {}

  async onModuleInit() {
    const settings = await this.getSettings();
    if (settings.mail) {
      this.mailService.setSmtpConfig({
        transport: 'smtp',
        host: settings.mail.host,
        port: settings.mail.port,
        user: settings.mail.user || undefined,
        secure: settings.mail.secure,
        from: settings.mail.from,
      });
    }
  }

  private async getRow(): Promise<StoreSetting> {
    let row = await this.repo.findOne({ where: {} });
    if (!row) {
      row = this.repo.create({
        storeName: DEFAULT_SETTINGS.storeName,
        storeLogoUrl: null,
        storeLogoKey: null,
        faviconUrl: null,
        faviconKey: null,
        contactEmail: DEFAULT_SETTINGS.contactEmail,
        phone: DEFAULT_SETTINGS.phone,
        storeAddress: DEFAULT_SETTINGS.storeAddress,
        taxId: DEFAULT_SETTINGS.taxId,
        registrationDetails: DEFAULT_SETTINGS.registrationDetails,
        currency: DEFAULT_SETTINGS.currency,
        timeZone: DEFAULT_SETTINGS.timeZone,
        standardDeliveryCharge: DEFAULT_SETTINGS.standardDeliveryCharge,
        freeDeliveryThreshold: DEFAULT_SETTINGS.freeDeliveryThreshold,
        deliveryRegions: DEFAULT_SETTINGS.deliveryRegions,
        enableTax: DEFAULT_SETTINGS.enableTax,
        defaultTaxRate: DEFAULT_SETTINGS.defaultTaxRate,
        productPriceType: DEFAULT_SETTINGS.productPriceType,
        minOrderValue: DEFAULT_SETTINGS.minOrderValue,
        maxOrderValue: DEFAULT_SETTINGS.maxOrderValue,
        allowCod: DEFAULT_SETTINGS.allowCod,
        cancellationWindowMinutes:
          DEFAULT_SETTINGS.cancellationWindowMinutes,
        paymentUpi: DEFAULT_SETTINGS.paymentMethods.upi,
        paymentCard: DEFAULT_SETTINGS.paymentMethods.card,
        paymentNetBanking: DEFAULT_SETTINGS.paymentMethods.netBanking,
        paymentCod: DEFAULT_SETTINGS.paymentMethods.cod,
        mailHost: DEFAULT_SETTINGS.mail.host,
        mailPort: DEFAULT_SETTINGS.mail.port,
        mailUser: DEFAULT_SETTINGS.mail.user || null,
        mailPassword: DEFAULT_SETTINGS.mail.password || null,
        mailFrom: DEFAULT_SETTINGS.mail.from,
        mailSecure: DEFAULT_SETTINGS.mail.secure,
      });
      row = await this.repo.save(row);
      this.logger.log('Seeded store settings into database');
    }
    return row;
  }

  async getSettings(): Promise<StoreSettings> {
    return toApi(await this.getRow());
  }

  async updateSettings(patch: Partial<StoreSettings>): Promise<StoreSettings> {
    const row = await this.getRow();
    if (patch.storeName !== undefined) row.storeName = patch.storeName;
    if (patch.storeLogo !== undefined)
      row.storeLogoUrl = patch.storeLogo || null;
    if (patch.favicon !== undefined) row.faviconUrl = patch.favicon || null;
    if (patch.contactEmail !== undefined) row.contactEmail = patch.contactEmail;
    if (patch.phone !== undefined) row.phone = patch.phone;
    if (patch.storeAddress !== undefined) row.storeAddress = patch.storeAddress;
    if (patch.taxId !== undefined) row.taxId = patch.taxId;
    if (patch.registrationDetails !== undefined)
      row.registrationDetails = patch.registrationDetails;
    if (patch.currency !== undefined) row.currency = patch.currency;
    if (patch.timeZone !== undefined) row.timeZone = patch.timeZone;
    if (patch.standardDeliveryCharge !== undefined)
      row.standardDeliveryCharge = patch.standardDeliveryCharge;
    if (patch.freeDeliveryThreshold !== undefined)
      row.freeDeliveryThreshold = patch.freeDeliveryThreshold;
    if (patch.deliveryRegions !== undefined)
      row.deliveryRegions = patch.deliveryRegions;
    if (patch.enableTax !== undefined) row.enableTax = patch.enableTax;
    if (patch.defaultTaxRate !== undefined)
      row.defaultTaxRate = patch.defaultTaxRate;
    if (patch.productPriceType !== undefined)
      row.productPriceType = patch.productPriceType;
    if (patch.minOrderValue !== undefined)
      row.minOrderValue = patch.minOrderValue;
    if (patch.maxOrderValue !== undefined)
      row.maxOrderValue = patch.maxOrderValue;
    if (patch.allowCod !== undefined) row.allowCod = patch.allowCod;
    if (patch.cancellationWindowMinutes !== undefined)
      row.cancellationWindowMinutes = patch.cancellationWindowMinutes;
    if (patch.paymentMethods) {
      if (patch.paymentMethods.upi !== undefined)
        row.paymentUpi = patch.paymentMethods.upi;
      if (patch.paymentMethods.card !== undefined)
        row.paymentCard = patch.paymentMethods.card;
      if (patch.paymentMethods.netBanking !== undefined)
        row.paymentNetBanking = patch.paymentMethods.netBanking;
      if (patch.paymentMethods.cod !== undefined)
        row.paymentCod = patch.paymentMethods.cod;
    }
    if (patch.mail) {
      if (patch.mail.host !== undefined) row.mailHost = patch.mail.host;
      if (patch.mail.port !== undefined)
        row.mailPort = Number(patch.mail.port);
      if (patch.mail.user !== undefined)
        row.mailUser = patch.mail.user || null;
      if (patch.mail.password !== undefined)
        row.mailPassword = patch.mail.password || null;
      if (patch.mail.from !== undefined) row.mailFrom = patch.mail.from;
      if (patch.mail.secure !== undefined) row.mailSecure = patch.mail.secure;
      this.mailService.setSmtpConfig({
        transport: 'smtp',
        host: row.mailHost,
        port: Number(row.mailPort),
        user: row.mailUser || undefined,
        password: row.mailPassword || undefined,
        secure: Boolean(row.mailSecure),
        from: row.mailFrom,
      });
      this.logger.log(
        `SMTP settings updated from Admin Panel: ${row.mailHost}:${row.mailPort}`,
      );
    }
    await this.repo.save(row);
    return this.getSettings();
  }

  async setBrandImage(
    kind: 'logo' | 'favicon',
    url: string,
    storageKey: string,
  ): Promise<StoreSettings> {
    const row = await this.getRow();
    if (kind === 'logo') {
      row.storeLogoUrl = url;
      (row as { storeLogoKey: string | null }).storeLogoKey = storageKey;
    } else {
      row.faviconUrl = url;
      (row as { faviconKey: string | null }).faviconKey = storageKey;
    }
    await this.repo.save(row);
    return this.getSettings();
  }

  async sendTestEmail(to: string): Promise<{ success: boolean; message: string }> {
    const row = await this.getRow();
    await this.mailService.sendTestMail(to);
    return {
      success: true,
      message: `Test email sent successfully to ${to} via ${row.mailHost}:${row.mailPort}`,
    };
  }
}
