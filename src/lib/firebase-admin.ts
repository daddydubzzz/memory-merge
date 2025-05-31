import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK only once
let adminApp: App | undefined;
let adminDbInstance: Firestore | undefined;

function getFirebaseAdmin() {
  if (!adminApp) {
    // Check if we already have an admin app initialized
    const existingApps = getApps();
    const adminAppExists = existingApps.find(app => app.name === '[DEFAULT]');
    
    if (adminAppExists) {
      adminApp = adminAppExists;
    } else {
      try {
        // Use the correct service account key from Vercel environment
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
          // Use service account key from Vercel environment
          const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
          adminApp = initializeApp({
            credential: cert(serviceAccount),
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          });
          console.log('🔑 Firebase Admin initialized with Vercel service account');
        } else if (process.env.NEXT_PUBLIC_SERVICE_ROLE_SECRET) {
          // Fallback to alternative service account key name
          const serviceAccount = JSON.parse(process.env.NEXT_PUBLIC_SERVICE_ROLE_SECRET);
          adminApp = initializeApp({
            credential: cert(serviceAccount),
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          });
          console.log('🔑 Firebase Admin initialized with fallback service account');
        } else {
          // For development, initialize without credentials (uses emulator or default project access)
          adminApp = initializeApp({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          });
          console.log('🔧 Firebase Admin initialized for development (no service account)');
        }
      } catch (error) {
        console.error('❌ Failed to initialize Firebase Admin:', error);
        throw new Error(`Firebase Admin initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }
  
  if (!adminDbInstance) {
    adminDbInstance = getFirestore(adminApp);
  }
  
  return { app: adminApp, db: adminDbInstance };
}

// Export the admin database instance
export const adminDb = () => getFirebaseAdmin().db;

export default getFirebaseAdmin; 