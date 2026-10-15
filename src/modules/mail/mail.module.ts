import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service.js';

/** Global so any feature module can send email without importing MailModule. */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
