# Troubleshooting Authentication

## Issue: "Firebase Admin not initialized" or 401 Unauthorized errors

### Step 1: Verify your .env file location
Make sure your `.env` file is in the `server/` directory, not the root directory.

### Step 2: Check FIREBASE_SERVICE_ACCOUNT format

The `FIREBASE_SERVICE_ACCOUNT` in your `.env` file should be a valid JSON string. There are two ways to format it:

#### Option A: Single line (with escaped quotes)
```env
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```

#### Option B: Multi-line (using single quotes)
```env
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"your-project",...}'
```

**Important notes:**
- If using double quotes, you need to escape internal quotes: `\"`
- The private key should include `\n` for newlines
- Make sure there are no trailing commas in the JSON

### Step 3: Restart your server
After adding or modifying the `.env` file, you **must restart your server** for changes to take effect.

```bash
# Stop the server (Ctrl+C)
# Then restart it
cd server
npm start
# or
npm run dev
```

### Step 4: Check server logs
When the server starts, you should see one of these messages:
- ✅ `Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT`
- ✅ `Firebase Admin initialized from service account file`
- ✅ `Firebase Admin initialized with default credentials`

If you see:
- ❌ `Firebase Admin initialization failed`
- ⚠️ `Firebase Admin is NOT initialized`

Then check the error message for details.

### Step 5: Verify the JSON is valid
You can test if your JSON is valid by running this in Node.js:

```javascript
// test-json.js
const jsonString = process.env.FIREBASE_SERVICE_ACCOUNT;
try {
  const parsed = JSON.parse(jsonString);
  console.log('✅ JSON is valid');
  console.log('Project ID:', parsed.project_id);
  console.log('Has private_key:', !!parsed.private_key);
  console.log('Has client_email:', !!parsed.client_email);
} catch (e) {
  console.error('❌ JSON is invalid:', e.message);
}
```

Run it with:
```bash
cd server
node -e "require('dotenv').config(); const json = process.env.FIREBASE_SERVICE_ACCOUNT; try { JSON.parse(json); console.log('✅ Valid JSON'); } catch(e) { console.error('❌ Invalid:', e.message); }"
```

### Alternative: Use a file instead
If the JSON string in `.env` is causing issues, you can use a file instead:

1. Save your service account JSON as `server/firebase-service-account.json`
2. Remove `FIREBASE_SERVICE_ACCOUNT` from `.env`
3. The server will automatically detect the file

Or set the path explicitly:
```env
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/your/firebase-service-account.json
```

### Still having issues?

1. Check that your Firebase project has Authentication enabled
2. Verify the service account has the correct permissions
3. Make sure you're using the correct Firebase project (same one as your frontend config)
4. Check server console for detailed error messages
