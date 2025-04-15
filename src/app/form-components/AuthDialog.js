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
    
    if (isLocked || isLoading) {
      return;
    }
    
    // Validate inputs
    if (!username || !password) {
      setError('Please enter both team name and password');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      // Create Base64 credentials
      const credentials = btoa(`${username}:${password}`);
      
      // Get a timestamp for cache-busting
      const timestamp = Date.now();
      
      // Call the server to validate
      const response = await fetch(`/api/auth/validate?t=${timestamp}`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache'
        },
        cache: 'no-store'
      });
      
      // Parse the response
      const data = await response.json();
      
      if (response.ok && data.authenticated === true) {
        // Reset attempts on successful login
        setAttempts(0);
        
        // Store credentials in sessionStorage for future API calls
        sessionStorage.setItem('auth_credentials', credentials);
        
        // Store scout team in localStorage for form auto-fill
        if (data.scoutTeam) {
          localStorage.setItem('scout_team', data.scoutTeam);
        }
        
        // Set auth cookies with different attributes for maximum compatibility
        // Set as normal cookie
        document.cookie = `auth_credentials=${credentials}; path=/; max-age=2592000`;
        
        // Set as SameSite=Lax cookie (best for localhost)
        document.cookie = `auth_credentials=${credentials}; path=/; max-age=2592000; SameSite=Lax`;
        
        // Set as SameSite=None+Secure for production
        if (window.location.protocol === 'https:') {
          document.cookie = `auth_credentials=${credentials}; path=/; max-age=2592000; SameSite=None; Secure`;
        }
        
        console.log("Set auth cookies with multiple approaches for best compatibility");
        
        // Also attempt to set cookies via fetch to ensure they're properly set server-side
        try {
          console.log("Setting server-side cookies via API call");
          await fetch('/api/auth/validate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Basic ${credentials}`
            },
            body: JSON.stringify({ setCookie: true }),
            credentials: 'same-origin'
          });
        } catch (e) {
          console.log("Cookie setting API call failed, proceeding with client cookies");
        }
        
        console.log("Login successful, calling onLogin handler");
        onLogin(credentials, data.scoutTeam);
      } else {
        // Handle failed login
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        
        // Implement lockout after 5 failed attempts
        if (newAttempts >= 5) {
          setIsLocked(true);
          setLockTimer(60);
          
          // Start a countdown timer
          const interval = setInterval(() => {
            setLockTimer(prev => {
              if (prev <= 1) {
                clearInterval(interval);
                setIsLocked(false);
                setAttempts(0);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        }
        
        setError(data.message || 'Invalid username or password');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
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