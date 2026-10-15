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
  private readonly config: AppConfig['mail'];
  private readonly transporter: Transporter | null;
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
