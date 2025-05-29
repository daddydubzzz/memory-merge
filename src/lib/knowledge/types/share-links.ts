// Share link interface for space invitations
export interface ShareLink {
  id?: string;
  spaceId: string;
  token: string; // unique 9-character token (longer than invite codes)
  createdBy: string; // user who generated link
  createdAt: Date;
  expiresAt?: Date; // optional expiration
  usageCount: number;
  maxUses?: number; // optional usage limit
  isActive: boolean;
  customMessage?: string; // optional personal message
} 