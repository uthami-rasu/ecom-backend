import type { User } from './entities/user.entity.js';

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  role: User['role'];
  emailVerified: boolean;
  createdAt: Date;
}

/** Explicit allow-list: password hashes and internal flags never leave the service layer. */
export const toUserProfile = (user: User): UserProfile => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  displayName: user.displayName,
  phone: user.phone,
  avatarUrl: user.avatarUrl,
  role: user.role,
  emailVerified: Boolean(user.emailVerifiedAt),
  createdAt: user.createdAt,
});
