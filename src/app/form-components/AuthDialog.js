'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../page.module.css';

export default function AuthDialog({ isOpen, onClose, onLogin, errorMessage }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(errorMessage || '');
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTimer, setLockTimer] = useState(0);
  const [redirectUrl, setRedirectUrl] = useState(null);
  const router = useRouter();
  
  // Get redirect URL from query params using window object instead of useSearchParams
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      setRedirectUrl(urlParams.get('redirect') || null);
    }
  }, []);

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
      console.log("=== AUTH DIALOG DEBUG START ===");
      console.log("AuthDialog: Attempting login for team:", username);
      
      // Create Base64 credentials
      const credentials = btoa(`${username}:${password}`);
      console.log("AuthDialog: Credentials created, calling parent login handler");
      
      // Call the parent's login handler which has enhanced debugging
      await onLogin(credentials, username);
      
      console.log("AuthDialog: Parent login handler completed");
      
      // Reset attempts on successful login (assuming success if no error thrown)
      setAttempts(0);
      
      // Reset form state
      setUsername('');
      setPassword('');
      setError('');
      
      // Note: Dialog closure is now handled by the parent login handler
      // to ensure proper timing with redirects
      
      console.log("=== AUTH DIALOG DEBUG END ===");
      
    } catch (error) {
      console.error('AuthDialog: Login error:', error);
      
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
        
        setError('Too many failed attempts. Please wait.');
      } else {
        setError(error.message || 'Login failed. Please check your credentials.');
      }
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
        
        {redirectUrl && (
          <p className={styles.RedirectInfo}>You'll be redirected to: {redirectUrl}</p>
        )}
        
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