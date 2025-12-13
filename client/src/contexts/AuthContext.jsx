import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  getIdToken
} from 'firebase/auth';
import { auth, googleProvider, facebookProvider, appleProvider } from '../config/firebase';

const AuthContext = createContext({});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        try {
          const idToken = await getIdToken(user);
          setToken(idToken);
        } catch (error) {
          console.error('Error getting token:', error);
          setToken(null);
        }
      } else {
        setToken(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await getIdToken(result.user);
      setToken(idToken);
      return result.user;
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  };

  const signInWithFacebook = async () => {
    try {
      const result = await signInWithPopup(auth, facebookProvider);
      const idToken = await getIdToken(result.user);
      setToken(idToken);
      return result.user;
    } catch (error) {
      console.error('Facebook sign-in error:', error);
      throw error;
    }
  };

  const signInWithApple = async () => {
    try {
      const result = await signInWithPopup(auth, appleProvider);
      const idToken = await getIdToken(result.user);
      setToken(idToken);
      return result.user;
    } catch (error) {
      console.error('Apple sign-in error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setToken(null);
    } catch (error) {
      console.error('Sign-out error:', error);
      throw error;
    }
  };

  const refreshToken = async () => {
    if (user) {
      try {
        const idToken = await getIdToken(user, true); // Force refresh
        setToken(idToken);
        return idToken;
      } catch (error) {
        console.error('Error refreshing token:', error);
        return null;
      }
    }
    return null;
  };

  const value = {
    user,
    token,
    loading,
    signInWithGoogle,
    signInWithFacebook,
    signInWithApple,
    signOut,
    refreshToken
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

