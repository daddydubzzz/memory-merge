export interface Account {
  id?: string;
  members: string[];
  createdAt: Date;
  settings: {
    allowNotifications: boolean;
    timezone: string;
  };
}

// Enhanced space management interfaces
export interface Space {
  id?: string;
  name: string;
  type: 'personal' | 'shared';
  owner: string;
  members: string[];
  icon?: string; // Emoji or icon identifier
  color?: string; // Theme color
  settings: SpaceSettings;
  createdAt: Date;
  updatedAt?: Date;
}

export interface SpaceSettings {
  allowNotifications: boolean;
  timezone: string;
  isPublic: boolean; // Whether space can be discovered
  allowMemberInvites: boolean; // Whether members can invite others
}

export interface UserProfile {
  uid: string;
  personalSpaceId: string; // Auto-created on signup
  activeSpaceId: string; // Currently selected space
  spaceMemberships: string[]; // All spaces user belongs to
  displayName?: string;
  email?: string;
  createdAt: Date;
  updatedAt?: Date;
} 