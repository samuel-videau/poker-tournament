import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin if not already initialized
let firebaseInitialized = false;

if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // Service account from environment variable (JSON string)
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        
        // Validate required fields
        if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
          throw new Error('Service account JSON is missing required fields (project_id, private_key, client_email)');
        }
        
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        firebaseInitialized = true;
        console.log('✅ Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT');
        console.log(`   Project ID: ${serviceAccount.project_id}`);
      } catch (parseError) {
        console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT:', parseError.message);
        console.error('   Make sure the JSON is properly formatted and escaped in your .env file');
        throw parseError;
      }
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      // Service account from file path
      const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      firebaseInitialized = true;
      console.log('Firebase Admin initialized from service account file');
    } else if (process.env.FIREBASE_PROJECT_ID) {
      // Use default credentials (for Google Cloud environments)
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID
      });
      firebaseInitialized = true;
      console.log('Firebase Admin initialized with default credentials');
    } else {
      // Try to load from default location
      try {
        const defaultPath = join(__dirname, '..', 'firebase-service-account.json');
        const serviceAccount = JSON.parse(readFileSync(defaultPath, 'utf8'));
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        firebaseInitialized = true;
        console.log('Firebase Admin initialized from default service account file');
      } catch (fileError) {
        console.error('Firebase Admin initialization failed. Please configure one of:');
        console.error('  - FIREBASE_SERVICE_ACCOUNT (JSON string)');
        console.error('  - FIREBASE_SERVICE_ACCOUNT_PATH (path to JSON file)');
        console.error('  - FIREBASE_PROJECT_ID (for Google Cloud default credentials)');
        console.error('  - firebase-service-account.json in server directory');
        firebaseInitialized = false;
      }
    }
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    firebaseInitialized = false;
  }
} else {
  firebaseInitialized = true;
  console.log('✅ Firebase Admin already initialized');
}

// Log initialization status on module load
if (!firebaseInitialized) {
  console.warn('⚠️  Firebase Admin is NOT initialized. Authentication will fail.');
  console.warn('   Check your server/.env file and ensure FIREBASE_SERVICE_ACCOUNT is set correctly.');
}

/**
 * Middleware to verify Firebase ID token
 * Extracts user ID from token and attaches to request
 */
export async function verifyToken(req, res, next) {
  try {
    // Check if Firebase Admin is initialized
    if (!firebaseInitialized || !admin.apps.length) {
      console.error('Firebase Admin not initialized. Cannot verify tokens.');
      return res.status(500).json({ 
        error: 'Server configuration error. Firebase Admin not initialized.' 
      });
    }
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized. No token provided.' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name
      };
      next();
    } catch (error) {
      console.error('Token verification error:', error.message);
      return res.status(401).json({ error: 'Unauthorized. Invalid token.' });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Middleware to verify tournament ownership
 * Must be used after verifyToken
 */
export async function verifyTournamentOwner(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user?.uid;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Get tournament from database
    const pool = req.app.get('db');
    const result = await pool.query(
      'SELECT owner FROM tournaments WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    
    const tournament = result.rows[0];
    
    // Check if user is the owner
    if (tournament.owner !== userId) {
      return res.status(403).json({ error: 'Forbidden. You do not own this tournament.' });
    }
    
    next();
  } catch (error) {
    console.error('Ownership verification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
