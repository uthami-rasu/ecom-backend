import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
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
 * Sends transactional email through one of three transports (MAIL_TRANSPORT):
 * `smtp` (Mailpit in development, a real relay in production), `log` (prints to the
 * console) or `memory` (in-process outbox read by the e2e tests).
 */
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private config: AppConfig['mail'];
  private transporter: Transporter | null;
  /** Filled only by the `memory` transport. */
  readonly outbox: SentMail[] = [];

  constructor(config: ConfigService<AppConfig, true>) {
    this.config = config.get('mail', { infer: true });
    this.transporter =
      this.config.transport === 'smtp'
        ? createTransport({
            host: this.config.host,
            port: this.config.port,
            secure: this.config.secure,
            auth: this.config.user
              ? { user: this.config.user, pass: this.config.password ?? '' }
              : undefined,
          })
        : null;
  }

  getSmtpConfig(): Partial<AppConfig['mail']> {
    return {
      transport: this.config.transport,
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
    this.transporter =
      this.config.transport === 'smtp'
        ? createTransport({
            host: this.config.host,
            port: this.config.port,
            secure: this.config.secure,
            auth: this.config.user
              ? { user: this.config.user, pass: this.config.password ?? '' }
              : undefined,
          })
        : null;
    this.logger.log(
      `SMTP transport reconfigured: ${this.config.host}:${this.config.port} (user: ${this.config.user ?? 'none'})`,
    );
  }

  async sendTestMail(to: string): Promise<void> {
    await this.deliver({
      to,
      subject: 'NutriStock Test Email Configuration',
      text: 'This is a test email confirming that your NutriStock Admin SMTP configuration is working correctly.',
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #1c3321; line-height: 1.6;">
          <h2 style="color: #1f7a55; margin-bottom: 8px;">NutriStock SMTP Verification</h2>
          <p>Congratulations! Your outgoing email server settings configured from the Admin Panel are functioning properly.</p>
          <div style="background-color: #f4f7f4; padding: 12px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Host:</strong> ${this.config.host}:${this.config.port}</p>
            <p style="margin: 4px 0;"><strong>Sender:</strong> ${this.config.from}</p>
            <p style="margin: 4px 0;"><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          </div>
        </div>
      `,
    });
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
    const from = this.config.from;
    switch (this.config.transport) {
      case 'memory':
        this.outbox.push({ ...message, from, sentAt: new Date() });
        return;
      case 'log':
        this.logger.log(
          `Email to ${message.to} — ${message.subject}\n${message.text}`,
        );
        return;
      default:
        await this.transporter!.sendMail({
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
    }
  }
}
