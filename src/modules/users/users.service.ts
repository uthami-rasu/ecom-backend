import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Not, Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum.js';
import { MailService } from '../mail/mail.service.js';
import { emailChangedNoticeMail } from '../mail/mail.templates.js';
import { OtpPurpose } from '../otp/entities/email-otp.entity.js';
import { OtpService, type OtpChallenge } from '../otp/otp.service.js';
import { ImageUploadService } from '../storage/image-upload.service.js';
import type { RequestEmailChangeDto } from './dto/email-change.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';
import { User } from './entities/user.entity.js';
import { toUserProfile, type UserProfile } from './user.mapper.js';

export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: Role;
  /** Self-registered accounts start unverified; seeded / admin-created ones are verified. */
  emailVerifiedAt?: Date | null;
}

const EMAIL_TAKEN = 'An account with this email already exists';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly images: ImageUploadService,
    private readonly otp: OtpService,
    private readonly mail: MailService,
  ) {}

  static hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async create(input: CreateUserInput): Promise<User> {
    const email = input.email.toLowerCase();
    if (await this.users.existsBy({ email })) {
      throw new ConflictException(EMAIL_TAKEN);
    }
    const user = this.users.create({
      email,
      passwordHash: await UsersService.hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      displayName: `${input.firstName} ${input.lastName}`.trim(),
      role: input.role ?? Role.Customer,
      emailVerifiedAt: input.emailVerifiedAt ?? null,
    });
    return this.users.save(user);
  }

  /**
   * Re-registration of an address that was never verified: whoever proves ownership
   * of the inbox with the new code gets the account with these details.
   */
  async updateUnverifiedRegistration(
    user: User,
    input: Pick<CreateUserInput, 'password' | 'firstName' | 'lastName'>,
  ): Promise<User> {
    user.passwordHash = await UsersService.hashPassword(input.password);
    user.firstName = input.firstName;
    user.lastName = input.lastName;
    user.displayName = `${input.firstName} ${input.lastName}`.trim();
    return this.users.save(user);
  }

  async markEmailVerified(user: User): Promise<User> {
    if (!user.emailVerifiedAt) {
      user.emailVerifiedAt = new Date();
      await this.users.update(
        { id: user.id },
        { emailVerifiedAt: user.emailVerifiedAt },
      );
    }
    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email: email.toLowerCase() });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  async getById(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user || !user.isActive) throw new NotFoundException('User not found');
    return user;
  }

  /** The only query that loads the password hash. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: email.toLowerCase() })
      .getOne();
  }

  async findByIdWithPassword(id: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id })
      .getOne();
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    try {
      return await argon2.verify(user.passwordHash, password);
    } catch {
      return false;
    }
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    await this.users.update(
      { id: userId },
      { passwordHash: await UsersService.hashPassword(newPassword) },
    );
  }

  async getProfile(userId: string): Promise<UserProfile> {
    return toUserProfile(await this.getById(userId));
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserProfile> {
    // Email changes go through requestEmailChange / confirmEmailChange (OTP to the new address).
    const user = await this.getById(userId);
    Object.assign(user, dto);
    await this.users.save(user);
    return this.getProfile(userId);
  }

  /** Step 1 of an email change: re-authenticate and send a code to the new address. */
  async requestEmailChange(
    userId: string,
    dto: RequestEmailChangeDto,
  ): Promise<OtpChallenge> {
    const user = await this.findByIdWithPassword(userId);
    if (!user || !user.isActive) throw new NotFoundException('User not found');
    if (dto.newEmail === user.email)
      throw new BadRequestException(
        'The new email is the same as your current email',
      );
    if (!(await this.verifyPassword(user, dto.password)))
      throw new UnauthorizedException('Password is incorrect');
    if (await this.users.existsBy({ email: dto.newEmail }))
      throw new ConflictException(EMAIL_TAKEN);

    await this.otp.issue(user, OtpPurpose.ChangeEmail, {
      email: dto.newEmail,
    });
    return this.otp.challenge(dto.newEmail, OtpPurpose.ChangeEmail);
  }

  /** Step 2: the code proves ownership of the new address; the old address is notified. */
  async confirmEmailChange(userId: string, code: string): Promise<UserProfile> {
    const user = await this.getById(userId);
    const otp = await this.otp.verify(userId, OtpPurpose.ChangeEmail, code);
    // The address may have been claimed while the code was in flight.
    if (await this.users.existsBy({ email: otp.email, id: Not(userId) }))
      throw new ConflictException(EMAIL_TAKEN);

    const previousEmail = user.email;
    await this.users.update(
      { id: userId },
      { email: otp.email, emailVerifiedAt: new Date() },
    );
    this.mail.sendInBackground({
      to: previousEmail,
      ...emailChangedNoticeMail({
        firstName: user.firstName,
        newEmail: otp.email,
      }),
    });
    return this.getProfile(userId);
  }

  async updateAvatar(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<UserProfile> {
    const user = await this.getById(userId);
    const stored = await this.images.upload('avatars', file);
    const previous = user.avatarUrl;
    await this.users.update({ id: userId }, { avatarUrl: stored.mediumUrl });
    // Avatar URLs embed their storage key: <base>/uploads/avatars/<uuid>-md.webp
    const previousKey = previous?.match(
      /\/uploads\/(avatars\/[0-9a-f-]{36})-md\.webp$/,
    )?.[1];
    await this.images.remove(previousKey);
    return this.getProfile(userId);
  }
}
