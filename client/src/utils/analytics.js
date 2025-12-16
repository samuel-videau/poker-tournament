// Google Analytics utility
const MEASUREMENT_ID = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;

// Initialize Google Analytics
export function initGA() {
  // Check if measurement ID is set
  if (!MEASUREMENT_ID || MEASUREMENT_ID.trim() === '') {
    if (import.meta.env.DEV) {
      console.warn('Google Analytics: VITE_FIREBASE_MEASUREMENT_ID not set. Analytics disabled.');
      console.warn('Add VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX to your client/.env file');
    }
    return;
  }

  // Validate measurement ID format (should start with G-)
  if (!MEASUREMENT_ID.startsWith('G-')) {
    console.error('Google Analytics: Invalid MEASUREMENT_ID format. Should start with "G-"');
    return;
  }

  // Load gtag script
  const script1 = document.createElement('script');
  script1.async = true;
  script1.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script1);

  // Initialize gtag
  window.dataLayer = window.dataLayer || [];
  function gtag(...args) {
    window.dataLayer.push(args);
  }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', MEASUREMENT_ID, {
    page_path: window.location.pathname,
  });

  if (import.meta.env.DEV) {
    console.log('✅ Google Analytics initialized:', MEASUREMENT_ID);
  }
}

// Track page view
export function trackPageView(path) {
  if (!MEASUREMENT_ID || !window.gtag) return;

  window.gtag('config', MEASUREMENT_ID, {
    page_path: path,
  });
}

// Track custom events
export function trackEvent(eventName, eventParams = {}) {
  if (!MEASUREMENT_ID || !window.gtag) return;

  window.gtag('event', eventName, eventParams);
}

// Track tournament creation
export function trackTournamentCreated(tournamentId, tournamentName) {
  trackEvent('tournament_created', {
    tournament_id: tournamentId,
    tournament_name: tournamentName,
  });
}

// Track tournament started
export function trackTournamentStarted(tournamentId) {
  trackEvent('tournament_started', {
    tournament_id: tournamentId,
  });
}

// Track tournament ended
export function trackTournamentEnded(tournamentId) {
  trackEvent('tournament_ended', {
    tournament_id: tournamentId,
  });
}

// Track player entry added
export function trackPlayerEntryAdded(tournamentId) {
  trackEvent('player_entry_added', {
    tournament_id: tournamentId,
  });
}

// Track knockout recorded
export function trackKnockoutRecorded(tournamentId) {
  trackEvent('knockout_recorded', {
    tournament_id: tournamentId,
  });
}

// Track login
export function trackLogin(method) {
  trackEvent('login', {
    method: method, // 'google', 'facebook', 'apple'
  });
}

// Track logout
export function trackLogout() {
  trackEvent('logout');
}


