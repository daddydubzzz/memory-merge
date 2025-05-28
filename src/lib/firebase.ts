import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Storage
export const storage = getStorage(app);

// Connect to emulators in development
// Commented out to use real Firebase services instead of emulators
// if (process.env.NODE_ENV === 'development') {
//   // Check if we're running in the browser and not already connected
//   if (typeof window !== 'undefined') {
//     try {
//       connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
//       connectFirestoreEmulator(db, 'localhost', 8080);
//       connectStorageEmulator(storage, 'localhost', 9199);
//     } catch (error) {
//       // Emulators already connected
//       console.log('Emulators already connected');
//     }
//   }
// }

export default app; 