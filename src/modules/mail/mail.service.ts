import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { Resend } from 'resend';
import type { AppConfig } from '../../config/configuration.js';
import type { RenderedMail } from './mail.templates.js';

export interface MailMessage extends RenderedMail {
  to: string;
}

export interface SentMail extends MailMessage {
  from: string;
  sentAt: Date;
}

export const MAIL_SEND_FAILED = 'Could not send email, please try again';

/**
 * Sends transactional email via Resend HTTP API (recommended on cloud platforms like Render),
 * Gmail SMTP (MAIL_TRANSPORT=smtp with MAIL_HOST=smtp.gmail.com, or Admin Panel settings stored in DB),
 * `log` (prints to the console) or `memory` (in-process outbox read by tests).
 * All sending happens in the backend only — the frontend never sends mail.
 */
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private config: AppConfig['mail'];
  private transporter: Transporter | null = null;
  private resendClient: Resend | null = null;
  /** Filled only by the `memory` transport. */
  readonly outbox: SentMail[] = [];

  constructor(config: ConfigService<AppConfig, true>) {
    this.config = config.get('mail', { infer: true });
    this.initTransport();
  }

  private initTransport(): void {
    if (this.config.transport === 'resend') {
      const apiKey = this.config.resendApiKey || process.env.RESEND_API_KEY;
      if (apiKey) {
        this.resendClient = new Resend(apiKey);
        this.logger.log('Resend email transport initialized');
      } else {
        this.logger.warn('Resend transport selected, but RESEND_API_KEY is not configured');
      }
    } else if (this.config.transport === 'smtp') {
      this.transporter = createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: this.config.user
          ? { user: this.config.user, pass: this.config.password ?? '' }
          : undefined,
      });
      this.logger.log(
        `SMTP transport initialized: ${this.config.host}:${this.config.port} (user: ${this.config.user ?? 'none'})`,
      );
    }
  }

  get transport(): string {
    return this.config.transport;
  }

  getSmtpConfig(): Partial<AppConfig['mail']> {
    return {
      transport: this.config.transport,
      resendApiKey: this.config.resendApiKey ? '••••••••' : undefined,
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      user: this.config.user,
      from: this.config.from,
    };
  }

  setSmtpConfig(newConfig: Partial<AppConfig['mail']>): void {
    this.config = { ...this.config, ...newConfig };
    this.transporter?.close();
    this.transporter = null;
    this.resendClient = null;
    this.initTransport();
  }

  async sendTestMail(to: string): Promise<void> {
    try {
      await this.deliver({
        to,
        subject: 'Bossco Naturals Test Email Configuration',
        text: `This is a test email confirming that your Bossco email configuration (${this.config.transport.toUpperCase()}) is working correctly.`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #1c3321; line-height: 1.6;">
            <h2 style="color: #1f7a55; margin-bottom: 8px;">Bossco Email Verification</h2>
            <p>Congratulations! Your outgoing email server settings (${this.config.transport.toUpperCase()}) are functioning properly.</p>
            <div style="background-color: #f4f7f4; padding: 12px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Transport:</strong> ${this.config.transport}</p>
              <p style="margin: 4px 0;"><strong>Sender:</strong> ${this.config.from}</p>
              <p style="margin: 4px 0;"><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
            </div>
          </div>
        `,
      });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message.split('\n')[0] : String(error);
      this.logger.error(`Test email to ${to} failed: ${detail}`);
      throw new ServiceUnavailableException(
        `Could not send email via ${this.config.transport}: ${detail}`,
      );
    }
  }

  get storefrontUrl(): string {
    return this.config.storefrontUrl;
  }

  /** Awaited delivery: failures surface as 503 so the caller can retry (used for OTP codes). */
  async send(message: MailMessage): Promise<void> {
    try {
      await this.deliver(message);
    } catch (error) {
      // The subject is not logged: OTP subjects contain the code.
      this.logger.error(
        `Failed to send email to ${message.to}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(MAIL_SEND_FAILED);
    }
  }

  /** Fire-and-forget delivery for notifications: errors are logged, never thrown. */
  sendInBackground(message: MailMessage | Promise<MailMessage | null>): void {
    Promise.resolve(message)
      .then((resolved) => (resolved ? this.deliver(resolved) : undefined))
      .catch((error: unknown) =>
        this.logger.error(
          'Failed to send notification email',
          error instanceof Error ? error.stack : String(error),
        ),
      );
  }

  clearOutbox(): void {
    this.outbox.length = 0;
  }

  onModuleDestroy(): void {
    this.transporter?.close();
  }

  private async deliver(message: MailMessage): Promise<void> {
    const from =
      this.config.from && !this.config.from.includes('bossco.local')
        ? this.config.from
        : 'Bossco Naturals <onboarding@resend.dev>';

    switch (this.config.transport) {
      case 'memory':
        this.outbox.push({ ...message, from: this.config.from, sentAt: new Date() });
        return;
      case 'log':
        this.logger.log(
          `[LOG EMAIL] To: ${message.to} — ${message.subject}\n${message.text}`,
        );
        return;
      case 'resend': {
        const apiKey = this.config.resendApiKey || process.env.RESEND_API_KEY;
        if (!this.resendClient && apiKey) {
          this.resendClient = new Resend(apiKey);
        }
        if (!this.resendClient) {
          throw new ServiceUnavailableException(
            'Resend API key is not configured. Please set RESEND_API_KEY in environment.',
          );
        }

        const { data, error } = await this.resendClient.emails.send({
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });

        if (error) {
          this.logger.error(
            `Resend API error sending to ${message.to}: ${error.message} (${error.name})`,
          );
          throw new ServiceUnavailableException(
            `Email delivery failed via Resend: ${error.message}`,
          );
        }

        this.logger.log(
          `Email successfully sent via Resend to ${message.to} (Message ID: ${data?.id})`,
        );
        return;
      }
      case 'smtp':
      default:
        if (!this.transporter) {
          throw new ServiceUnavailableException('SMTP transporter is not configured');
        }
        await this.transporter.sendMail({
          from: this.config.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
    }
  }
}
