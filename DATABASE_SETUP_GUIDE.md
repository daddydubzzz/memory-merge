# Database Setup Guide for Memory Merge

This application uses a **dual-database architecture**:
- **Supabase (PostgreSQL + pgvector)**: For vector embeddings and semantic search
- **Firebase Firestore**: For account management, user profiles, and spaces

## Prerequisites

1. **Supabase Project**: Create a new project at [supabase.com](https://supabase.com)
2. **Firebase Project**: Create a new project at [console.firebase.google.com](https://console.firebase.google.com)
3. **OpenAI API Key**: Required for generating embeddings

## 1. Supabase Setup

### Step 1: Run the SQL Setup Script

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run the provided `supabase-setup.sql` script

This will create:
- `knowledge_vectors` table with vector embedding support
- Indexes for optimal performance
- `match_knowledge_vectors` function for semantic search
- Row Level Security policies

### Step 2: Environment Variables

Add these to your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 2. Firebase/Firestore Setup

### Step 1: Enable Firestore

1. In your Firebase console, go to **Firestore Database**
2. Click **Create database**
3. Choose **Start in test mode** (you can secure it later)
4. Select your preferred region

### Step 2: Collections Structure

The application will automatically create these collections:

#### `accounts` Collection
```typescript
{
  id: string,
  members: string[],
  createdAt: Date,
  settings: {
    allowNotifications: boolean,
    timezone: string
  }
}
```

#### `spaces` Collection
```typescript
{
  id: string,
  name: string,
  type: 'personal' | 'shared',
  owner: string,
  members: string[],
  icon?: string,
  color?: string,
  settings: {
    allowNotifications: boolean,
    timezone: string,
    isPublic: boolean,
    allowMemberInvites: boolean
  },
  createdAt: Date,
  updatedAt?: Date
}
```

#### `userProfiles` Collection
```typescript
{
  uid: string,
  personalSpaceId: string,
  activeSpaceId: string,
  spaceMemberships: string[],
  displayName?: string,
  email?: string,
  createdAt: Date,
  updatedAt?: Date
}
```

#### `shareLinks` Collection
```typescript
{
  id: string,
  spaceId: string,
  token: string,
  createdBy: string,
  createdAt: Date,
  expiresAt?: Date,
  usageCount: number,
  maxUses?: number,
  isActive: boolean,
  customMessage?: string
}
```

#### `knowledge` Collection (Legacy/Backup)
```typescript
{
  id: string,
  content: string,
  tags: string[],
  addedBy: string,
  createdAt: Date,
  updatedAt: Date,
  accountId: string,
  timestamp?: string,
  replaces?: string,
  replaced_by?: string,
  intent?: "create" | "update" | "delete" | "purchase" | "clear_list",
  items?: string[],
  listType?: string
}
```

### Step 3: Security Rules

Update your Firestore security rules in the Firebase console:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow authenticated users to read/write their own user profile
    match /userProfiles/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Allow space members to read/write space documents
    match /spaces/{spaceId} {
      allow read, write: if request.auth != null && 
        request.auth.uid in resource.data.members;
    }
    
    // Allow account members to read/write account documents
    match /accounts/{accountId} {
      allow read, write: if request.auth != null && 
        request.auth.uid in resource.data.members;
    }
    
    // Allow authenticated users to read/write knowledge in their spaces
    match /knowledge/{docId} {
      allow read, write: if request.auth != null;
      // TODO: Add proper space-based authorization
    }
    
    // Allow space members to manage share links
    match /shareLinks/{linkId} {
      allow read, write: if request.auth != null;
      // TODO: Add proper authorization based on space membership
    }
  }
}
```

### Step 4: Firebase Configuration

Add your Firebase config to `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

## 3. Authentication Setup

### Firebase Authentication

1. In Firebase console, go to **Authentication**
2. Click **Get started**
3. Enable your preferred sign-in methods (Email/Password, Google, etc.)

### Supabase RLS Policies

The current RLS policies in the SQL script are permissive (`true` conditions). You'll need to update them based on your authentication strategy. For Firebase Auth integration:

```sql
-- Example: Update policies to check Firebase Auth tokens
-- You'll need to implement token verification in your backend

CREATE POLICY "Users can view their account's knowledge vectors" ON public.knowledge_vectors
    FOR SELECT USING (
        account_id IN (
            SELECT id FROM accounts 
            WHERE auth.uid() = ANY(members)
        )
    );
```

## 4. OpenAI Integration

Add your OpenAI API key to `.env.local`:

```env
OPENAI_API_KEY=your_openai_api_key
```

## 5. Complete Environment Variables

Your final `.env.local` should include:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# OpenAI
OPENAI_API_KEY=your_openai_api_key
```

## 6. Testing the Setup

1. Start your development server: `npm run dev`
2. Try creating a knowledge entry to test Supabase integration
3. Try creating an account/space to test Firestore integration
4. Verify vector search is working by searching for existing content

## 7. Troubleshooting

### Common Issues:

1. **Vector search not working**: Ensure pgvector extension is enabled in Supabase
2. **Firestore permission denied**: Check your security rules
3. **OpenAI API errors**: Verify your API key and usage limits
4. **Missing environment variables**: Double-check all required env vars are set

### Useful Supabase SQL Queries:

```sql
-- Check if pgvector is enabled
SELECT * FROM pg_extension WHERE extname = 'vector';

-- View knowledge_vectors table structure
\d knowledge_vectors;

-- Test vector search function
SELECT * FROM match_knowledge_vectors(
    '[0.1, 0.2, ...]'::vector,  -- Replace with actual embedding
    'account_id',
    0.5,
    10
);
```

This setup provides a robust foundation for the Memory Merge application with both semantic search capabilities and structured data management. 