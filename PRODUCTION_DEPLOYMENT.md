# Production Deployment Guide

## Building the Client for Production

### Step 1: Build the Production Bundle

```bash
cd client
npm run build
```

This creates an optimized production build in the `client/dist` directory.

### Step 2: Serve the Production Build

You have several options:

## Option A: Preview Locally (Testing)

For testing the production build locally:

```bash
cd client
npm run preview
```

This starts a local server (usually on port 4173) to preview the production build.

## Option B: Serve from Express Server (Recommended)

Serve the static files directly from your Express server.

### Update server/index.js

Add this before your API routes:

```javascript
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ... existing code ...

// Serve static files from client/dist in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '../client/dist')));
  
  // Handle React Router - return index.html for all non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(__dirname, '../client/dist/index.html'));
    }
  });
}
```

### Start the server:

```bash
cd server
NODE_ENV=production npm start
```

## Option C: Use a Web Server (Nginx, Apache, etc.)

### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Serve static files
    root /path/to/poker-tournament/client/dist;
    index index.html;

    # API proxy
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # React Router - all routes go to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Option D: Use a Static Hosting Service

### Vercel / Netlify

1. Build the client: `npm run build`
2. Deploy the `client/dist` directory
3. Configure the API proxy to point to your server

### Environment Variables for Production

Make sure to set these in your production environment:

**Client (.env or hosting platform):**
```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

**Server (.env):**
```env
NODE_ENV=production
DATABASE_URL=your-production-database-url
FIREBASE_SERVICE_ACCOUNT=your-service-account-json
PORT=3001
```

## Production Checklist

- [ ] Build the client: `npm run build`
- [ ] Set all environment variables
- [ ] Test the production build locally with `npm run preview`
- [ ] Configure CORS on the server if client is on a different domain
- [ ] Set up SSL/HTTPS certificates
- [ ] Configure firewall rules
- [ ] Set up process manager (PM2, systemd, etc.)
- [ ] Configure logging
- [ ] Set up monitoring and error tracking

## Process Manager (PM2) Example

Install PM2:
```bash
npm install -g pm2
```

Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'poker-tournament-server',
    script: './server/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
```

Start with PM2:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## CORS Configuration

If your client and server are on different domains, update CORS in `server/index.js`:

```javascript
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
```

## Quick Start Commands

```bash
# Build client
cd client && npm run build

# Start server in production
cd server && NODE_ENV=production npm start

# Or with PM2
pm2 start ecosystem.config.js
```
