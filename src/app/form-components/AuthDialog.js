'use client';

import { useState, useEffect } from 'react';
import styles from '../page.module.css';

export default function AuthDialog({ isOpen, onClose, onLogin, errorMessage }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(errorMessage || '');
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTimer, setLockTimer] = useState(0);

  // Reset error when errorMessage prop changes
  useEffect(() => {
    if (errorMessage) {
      setError(errorMessage);
    }
  }, [errorMessage]);

  // Handle lock timer countdown
  useEffect(() => {
    let interval;
    if (isLocked && lockTimer > 0) {
      interval = setInterval(() => {
        setLockTimer(prev => {
          if (prev <= 1) {
            setIsLocked(false);
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isLocked, lockTimer]);

  // Clear lock message when timer expires
  useEffect(() => {
    if (lockTimer === 0 && isLocked === false && error.includes('Try again in')) {
      setError('');
    }
  }, [lockTimer, isLocked, error]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Prevent submission if locked
    if (isLocked) return;
    
    // Basic input validation
    if (!username.trim() || !password.trim()) {
      setError('Team name and password are required');
      return;
    }
    
    // Prevent XSS in credentials
    const sanitizedUsername = username.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    setIsLoading(true);
    setError('');

    try {
      // First, clear any existing invalid auth cookies
      document.cookie = 'auth_credentials=; path=/; max-age=0; SameSite=Strict';
      document.cookie = 'auth_validated=; path=/; max-age=0; SameSite=Strict';
      
      // Convert credentials to base64 for Basic Auth
      const credentials = btoa(`${sanitizedUsername}:${password}`);
      
      console.log(`Attempting login for team: ${sanitizedUsername}`);
      
      // Try to authenticate by making a request to a protected endpoint
      // Add cache busting to prevent any caching
      const timestamp = new Date().getTime();
      const random = Math.random().toString(36).substring(2);
      
      const response = await fetch(`/api/auth/validate?_t=${timestamp}&_r=${random}`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'X-Random': random
        },
        cache: 'no-store',
        credentials: 'same-origin'
      });
      
      // Read response data regardless of status
      let data;
      try {
        data = await response.json();
      } catch (e) {
        console.error("Error parsing auth response:", e);
        data = { authenticated: false, message: "Error parsing server response" };
      }
      
      console.log(`Auth response status: ${response.status}, authenticated: ${data.authenticated}`);
      
      if (response.ok && data.authenticated === true) {
        // Reset attempts on successful login
        setAttempts(0);
        
        // Store credentials in sessionStorage for future API calls
        sessionStorage.setItem('auth_credentials', credentials);
        
        // Store scout team in localStorage for form auto-fill
        if (data.scoutTeam) {
          localStorage.setItem('scout_team', data.scoutTeam);
        }
        
        // Also store in a cookie for middleware to access with longer expiration (30 days)
        document.cookie = `auth_credentials=${credentials}; path=/; max-age=2592000; SameSite=Strict`;
        
        // Set success validation
        document.cookie = 'auth_validated=success; path=/; max-age=60';
        
        console.log("Login successful, calling onLogin handler");
        onLogin(credentials, data.scoutTeam);
      } else if (response.status === 429) {
        // Rate limited
        setIsLocked(true);
        const retryAfter = response.headers.get('Retry-After') || 60;
        setLockTimer(parseInt(retryAfter, 10));
        setError(`Too many login attempts. Please try again later.`);
        clearAuthCookies();
      } else {
        // Other auth failure
        console.log("Login failed, handling auth failure");
        handleAuthFailure();
      }
    } catch (err) {
      setError('An error occurred during authentication');
      console.error('Auth error:', err);
      clearAuthCookies();
    } finally {
      setIsLoading(false);
      // Clear password field on failure for security
      if (error) {
        setPassword('');
      }
    }
  };

  // Helper function to handle auth failure
  const handleAuthFailure = () => {
    // Increment failed attempts
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    
    // If too many failed attempts, lock the form
    if (newAttempts >= 5) {
      const lockTime = Math.min(30 * (newAttempts - 4), 300); // Exponential backoff, max 5 min
      setIsLocked(true);
      setLockTimer(lockTime);
      setError(`Too many failed attempts. Try again in ${lockTime} seconds.`);
    } else {
      setError(`Invalid team name or password. ${5 - newAttempts} attempts remaining.`);
    }
    
    // Clear any existing auth cookies/storage
    clearAuthCookies();
  };

  // Helper function to clear auth cookies
  const clearAuthCookies = () => {
    // Clear sessionStorage
    sessionStorage.removeItem('auth_credentials');
    
    // Clear cookies
    document.cookie = 'auth_credentials=; path=/; max-age=0; SameSite=Strict';
    document.cookie = 'auth_validated=failed; path=/; max-age=30; SameSite=Strict';
  };

  const handleCancel = () => {
    // Clear state before closing
    setUsername('');
    setPassword('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.QRCodeOverlay} onClick={e => e.target === e.currentTarget && handleCancel()}>
      <div className={styles.QRCodeContainer}>
        <h2>Authentication Required</h2>
        <p className={styles.LoginSubheader}>Please login with your team credentials</p>
        
        {error && <p className={styles.ErrorText}>{error}</p>}
        {isLocked && lockTimer > 0 && <p className={styles.ErrorText}>Account locked. Try again in {lockTimer} seconds.</p>}
        
        <form onSubmit={handleSubmit} className={styles.AuthForm}>
          <div className={styles.FormGroup}>
            <label htmlFor="username">Team Name</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className={styles.FormInput}
              disabled={isLocked || isLoading}
              autoComplete="username"
              autoFocus
              placeholder="Enter your team name"
            />
          </div>
          <div className={styles.FormGroup}>
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={styles.FormInput}
              disabled={isLocked || isLoading}
              autoComplete="current-password"
              placeholder="Enter your password"
            />
          </div>
          <div className={styles.AuthButtonsContainer}>
            <button 
              type="submit" 
              className={styles.SubmitButton}
              disabled={isLoading || isLocked}
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
            <button 
              type="button" 
              onClick={handleCancel} 
              className={styles.CancelButton}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 