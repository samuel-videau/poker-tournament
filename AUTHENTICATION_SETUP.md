# Authentication Setup Guide

This application uses Firebase Authentication to secure host pages. Follow these steps to set up authentication:

## 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" and follow the setup wizard
3. Enable Authentication:
   - Go to Authentication > Sign-in method
   - Enable the following providers:
     - Google
     - Facebook
     - Apple (if needed)

## 2. Configure Frontend (Client)

Create a `.env` file in the `client` directory with your Firebase config:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

You can find these values in Firebase Console > Project Settings > General > Your apps.

**Note:** `VITE_FIREBASE_MEASUREMENT_ID` is optional but recommended for Google Analytics tracking. You can find it in Firebase Console > Project Settings > General > Your apps, or in Google Analytics > Admin > Data Streams.

## 3. Configure Backend (Server)

You need to set up Firebase Admin SDK for token verification. Create a `.env` file in the `server` directory.

### Option A: Service Account File (Easiest)

1. Go to Firebase Console > Project Settings > Service Accounts
2. Click "Generate new private key"
3. Save the JSON file as `firebase-service-account.json` in the `server` directory
4. Add to `.gitignore` to keep it secure

The server will automatically detect this file.

### Option B: Service Account via Environment Variable

1. Go to Firebase Console > Project Settings > Service Accounts
2. Click "Generate new private key"
3. Copy the entire JSON content
4. Add to `server/.env`:

```env
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}'
```

**Note:** Make sure to escape quotes properly or use single quotes around the JSON string.

### Option C: Service Account File Path

If you want to store the file elsewhere:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/your/firebase-service-account.json
```

### Option D: Default Credentials (For Google Cloud)

If running on Google Cloud Platform, you can use default credentials:

```env
FIREBASE_PROJECT_ID=your-project-id
```

### Verify Configuration

After setting up, restart your server. You should see one of these messages:
- "Firebase Admin initialized from service account file"
- "Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT"
- "Firebase Admin initialized with default credentials"

If you see "Firebase Admin not initialized", check your configuration.

## 4. Features

- **Host Pages**: Protected by authentication (login required)
  - `/host` - Dashboard
  - `/host/game/:id` - Tournament management
  
- **Public Pages**: No authentication required
  - `/display/:id` - Public tournament display

- **Authentication Providers**:
  - Google Sign-In
  - Facebook Sign-In
  - Apple Sign-In

## 5. Security

- All tournament modification endpoints require authentication
- Each tournament has an `owner` field (Firebase UID)
- Only the tournament owner can access/modify their tournaments
- Public displays remain accessible without authentication

## Troubleshooting

- **"Firebase Admin not configured"**: Make sure you've set up the service account or project ID
- **"Unauthorized" errors**: Check that your Firebase config is correct
- **Token verification fails**: Ensure your Firebase project has Authentication enabled
