'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import styles from '../page.module.css';

export default function AuthDialog({ isOpen, onClose, onLogin, errorMessage }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(errorMessage || '');
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTimer, setLockTimer] = useState(0);
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Get redirect URL from query params if available
  const redirectUrl = searchParams?.get('redirect') || null;

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
      
      // First, validate the credentials
      const validateResponse = await fetch(`/api/auth/validate?t=${timestamp}`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache'
        },
        cache: 'no-store'
      });
      
      const validateData = await validateResponse.json();
      
      if (validateResponse.ok && validateData.authenticated === true) {
        // Credentials are valid, now create a session
        const sessionResponse = await fetch('/api/auth/session', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache'
          },
          credentials: 'include', // Important for cookies
          cache: 'no-store'
        });
        
        const sessionData = await sessionResponse.json();
        
        if (sessionResponse.ok && sessionData.success) {
          // Reset attempts on successful login
          setAttempts(0);
          
          // Store the basic auth for API calls
          sessionStorage.setItem('auth_credentials', credentials);
          
          // Store scout team in localStorage for form auto-fill
          if (validateData.scoutTeam) {
            localStorage.setItem('scout_team', validateData.scoutTeam);
          }
          
          console.log("Login successful, handling redirect");
          
          // Call onLogin handler
          onLogin(credentials, validateData.scoutTeam);
          
          // Handle redirection if a redirect URL is provided
          if (redirectUrl) {
            console.log(`Redirecting to: ${redirectUrl}`);
            
            // Use a timeout to ensure the cookies are set before redirecting
            // A slightly longer timeout helps ensure iOS Safari has processed the cookies
            setTimeout(() => {
              // Use window.location for a full page reload instead of router.push
              // This ensures the browser has the latest cookies when loading the page
              window.location.href = redirectUrl;
            }, 300);
          }
        } else {
          // Something went wrong creating the session
          setError(sessionData.message || 'Error creating session');
        }
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
        
        setError(validateData.message || 'Invalid username or password');
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