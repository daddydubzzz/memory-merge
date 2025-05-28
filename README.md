# Memory Merge

**An intelligent, shared knowledge repository for couples**

Memory Merge is a Progressive Web App that allows couples to store, organize, and retrieve household information through natural language interactions. Built with Next.js, Firebase, and OpenAI, it eliminates the mental load imbalance common in relationships by creating a centralized, AI-powered system both partners can easily access and contribute to.

## Features

- 🤖 **Natural Language Processing**: Ask questions and store information conversationally
- 🎤 **Voice Input**: Speak to add information hands-free
- 📱 **Progressive Web App**: Install like a native app on any device
- ⚡ **Real-time Sync**: Instantly share information between partners
- 🏷️ **Smart Categorization**: AI automatically organizes your information
- 🔍 **Intelligent Search**: Find information with fuzzy matching and context understanding
- 🔐 **Secure & Private**: End-to-end encryption with Firebase security

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
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

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# Next.js Configuration
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=http://localhost:3000
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
    
    // Couples can be read/written by their members
    match /couples/{coupleId} {
      allow read, write: if request.auth != null && 
        request.auth.uid in resource.data.members;
    }
    
    // Knowledge entries can be accessed by couple members
    match /knowledge/{entryId} {
      allow read, write: if request.auth != null && 
        exists(/databases/$(database)/documents/couples/$(resource.data.coupleId)) &&
        request.auth.uid in get(/databases/$(database)/documents/couples/$(resource.data.coupleId)).data.members;
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
2. **Setup Couple**: Create a new shared memory space
3. **Invite Partner**: Share the invite code with your partner
4. **Start Adding Information**: Use natural language to store information

### Storing Information

Use natural language to add information:
- "We got a new dishwasher warranty that expires in 2027"
- "Our favorite Thai restaurant is called Bangkok Garden on Main Street"
- "The WiFi password is MySecurePassword123"

### Finding Information

Ask questions naturally:
- "Where did we put the Christmas decorations?"
- "What's our WiFi password?"
- "When does the car registration expire?"

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
│   │   └── openai.ts                 # OpenAI integration
│   └── types/
│       └── speech.d.ts               # Speech API types
├── public/
│   └── manifest.json                 # PWA manifest
├── .env.example                      # Environment template
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
  coupleId?: string;
  createdAt: Timestamp;
}
```

**couples**: Couple relationships
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
  coupleId: string;          // Associated couple
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
- Firebase security rules ensure couple-only access
- OpenAI processes data but doesn't store it
- No third-party analytics or tracking

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, email support@memorymerge.app or open an issue on GitHub.

---

**Built with ❤️ for couples who want to share the mental load**
