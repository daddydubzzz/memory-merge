# Memory Merge

**An intelligent, shared knowledge repository for households**

Memory Merge is a Progressive Web App that allows household members (couples, families, roommates, etc.) to store, organize, and retrieve shared information through natural language interactions. Built with Next.js, Firebase, and OpenAI, it creates a centralized, AI-powered system that multiple people can easily access and contribute to, while providing each user with a personalized experience.

## Features

- 🤖 **Natural Language Processing**: Ask questions and store information conversationally
- 🎤 **Voice Input**: Speak to add information hands-free
- 📱 **Progressive Web App**: Install like a native app on any device
- ⚡ **Real-time Sync**: Instantly share information between household members
- 🏷️ **Smart Categorization**: AI automatically organizes your information into 13+ categories
- 🔍 **Intelligent Search**: Find information with fuzzy matching and context understanding
- 👤 **Personalized Experience**: Each user gets their own tailored interaction experience
- 🔐 **Secure & Private**: End-to-end encryption with Firebase security

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Firebase (Firestore, Auth, Storage)
- **AI**: OpenAI GPT-4o-mini
- **PWA**: next-pwa for offline capability and app installation
- **Deployment**: Vercel (recommended)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Firebase account
- OpenAI API account

### 1. Clone and Install

```bash
git clone <repository-url>
cd memory-merge
npm install
```

### 2. Environment Setup

Create a `.env.local` file in the root directory:

```bash
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
```

### 3. Firebase Setup

1. Create a new Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Authentication with Email/Password and Google providers
3. Create a Firestore database in production mode
4. Set up Firestore security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own profile
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Accounts can be created by any authenticated user and read/written by their members
    match /accounts/{accountId} {
      // Allow create for any authenticated user (when they're adding themselves to members)
      allow create: if request.auth != null && 
        request.auth.uid in request.resource.data.members;
      
      // Allow read/write for existing members
      allow read, write: if request.auth != null && 
        request.auth.uid in resource.data.members;
    }
    
    // Knowledge entries can be accessed by account members
    match /knowledge/{entryId} {
      // Allow create when user is member of the account they're adding to
      allow create: if request.auth != null && 
        exists(/databases/$(database)/documents/accounts/$(request.resource.data.accountId)) &&
        request.auth.uid in get(/databases/$(database)/documents/accounts/$(request.resource.data.accountId)).data.members;
      
      // Allow read/write for existing entries when user is member of the account
      allow read, write: if request.auth != null && 
        exists(/databases/$(database)/documents/accounts/$(resource.data.accountId)) &&
        request.auth.uid in get(/databases/$(database)/documents/accounts/$(resource.data.accountId)).data.members;
    }
  }
}
```

### 4. OpenAI Setup

1. Get an API key from [platform.openai.com](https://platform.openai.com)
2. Add it to your environment variables
3. The app uses GPT-4o-mini for cost efficiency

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## OpenAI Integration Details

The app uses OpenAI GPT-4o-mini in two main ways:

### 1. Intent Classification & Categorization
When users input information, the AI determines:
- **Intent**: Whether the user wants to store new information or retrieve existing information
- **Category**: Automatically categorizes into one of 13 predefined categories:
  - Tasks & Reminders
  - Home Maintenance
  - Documents
  - Schedules & Events
  - Shopping
  - Travel
  - Personal Notes
  - Household Items
  - Finance
  - Health & Medical
  - Contacts
  - Passwords & Accounts
  - Other

### 2. Response Generation
For queries, the AI:
- Searches the knowledge base for relevant entries
- Generates conversational responses based on found information
- Provides helpful suggestions for follow-up actions
- Maintains a personalized, friendly tone for each user

The prompts are designed to be inclusive of different household types (not just couples) and provide each user with a personalized experience.

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the project to Vercel
3. Add all environment variables in the Vercel dashboard
4. Deploy

### Other Platforms

The app can be deployed to any platform that supports Next.js:
- Netlify
- Railway
- Render
- Self-hosted

## Usage

### For New Users

1. **Sign Up**: Create an account with email or Google
2. **Create Account**: Set up a new shared household account
3. **Invite Members**: Share the invite code with other household members
4. **Start Adding Information**: Use natural language to store information

### Storing Information

Use natural language to add information:
- "Remind me to get golf balls tomorrow before the big match"
- "I need to remember to send back the Stitch Fix items that I don't want to keep"
- "We got a new dishwasher warranty that expires in 2027"
- "The WiFi password is MySecurePassword123"

### Finding Information

Ask questions naturally:
- "Where did we put the Christmas decorations?"
- "What's our WiFi password?"
- "When does the car registration expire?"
- "Show me my recent entries"

## Project Structure

```
memory-merge/
├── src/
│   ├── app/
│   │   ├── api/ai/process/route.ts    # OpenAI API endpoints
│   │   └── page.tsx                   # Main app page
│   ├── components/
│   │   ├── AuthForm.tsx              # Authentication UI
│   │   ├── ChatInterface.tsx         # Main chat interface
│   │   └── Dashboard.tsx             # App dashboard
│   ├── contexts/
│   │   └── AuthContext.tsx           # Authentication state
│   ├── lib/
│   │   ├── firebase.ts               # Firebase configuration
│   │   ├── knowledge.ts              # Firestore operations
│   │   ├── openai.ts                 # OpenAI integration
│   │   └── constants.ts              # Categories and types
│   └── types/
│       └── speech.d.ts               # Speech API types
├── public/
│   └── manifest.json                 # PWA manifest
└── next.config.ts                    # Next.js + PWA config
```

## Data Model

### Firestore Collections

**users**: User profiles and settings
```typescript
{
  email: string;
  displayName: string;
  photoURL?: string;
  accountId?: string;
  createdAt: Timestamp;
}
```

**accounts**: Household/family accounts
```typescript
{
  members: string[];           // Array of user IDs
  createdAt: Timestamp;
  settings: {
    allowNotifications: boolean;
    timezone: string;
  };
}
```

**knowledge**: Shared information entries
```typescript
{
  content: string;            // The actual information
  category: string;           // AI-categorized type
  tags: string[];            // Searchable tags
  addedBy: string;           // User ID who added it
  accountId: string;         // Associated account
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Security & Privacy

- All data is encrypted in transit and at rest
- Firebase security rules ensure account member-only access
- OpenAI processes data but doesn't store it
- No third-party analytics or tracking
- Each user gets their own personalized experience while sharing the same knowledge base

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, email support@memorymerge.app or open an issue on GitHub.

---

**Built with ❤️ for households who want to share information seamlessly**
