'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './admin.module.css';

// Local SVG icon components
const TeamIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
);

const LockIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
  </svg>
);

const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
    <polyline points="16 17 21 12 16 7"></polyline>
    <line x1="21" y1="12" x2="9" y2="12"></line>
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
);

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [newTeam, setNewTeam] = useState({ teamName: '', password: '' });
  const [cookieDebug, setCookieDebug] = useState('');
  const [showDebugUI, setShowDebugUI] = useState(false);
  const router = useRouter();

  // Define fetchTeams function before it's used in checkAuth
  const fetchTeams = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/teams');
      if (response.ok) {
        const data = await response.json();
        setTeams(data.teams);
      } else {
        setError('Failed to fetch teams');
      }
    } catch (err) {
      setError('Network error loading teams');
      console.error('Fetch teams error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Define checkAuth function outside useEffects so it can be used in multiple places
  const checkAuth = async () => {
    try {
      const response = await fetch('/api/admin/validate', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });
      
      if (response.ok) {
        setAuthenticated(true);
        // Only fetch teams after setting authenticated to true
        fetchTeams();
      }
    } catch (err) {
      console.error('Auth validation error:', err);
    }
  };

  // Function to dump cookie information to console
  const dumpCookiesToConsole = () => {
    const allCookies = document.cookie;
    
    // Get all cookie names
    const cookieNames = allCookies.split(';')
      .map(cookie => cookie.trim().split('=')[0]);
    
    console.group('🍪 Cookie Debug Dump');
    console.log('All cookies:', allCookies);
    
    if (cookieNames.length > 0) {
      console.table(cookieNames.map(name => {
        // Try to get cookie value
        const match = new RegExp(`${name}=([^;]+)`).exec(allCookies);
        const value = match ? match[1] : '';
        
        // Try to decode if possible
        let decodedValue = '';
        try {
          if (value && (name === 'admin_auth' || name === 'auth_credentials')) {
            decodedValue = Buffer.from(decodeURIComponent(value), 'base64').toString('utf-8');
          }
        } catch (e) {
          decodedValue = 'Error decoding';
        }
        
        return {
          name,
          value: value ? `${value.slice(0, 20)}${value.length > 20 ? '...' : ''}` : '(empty)',
          decoded: decodedValue || '(not applicable)',
          domain: document.location.hostname
        };
      }));
    } else {
      console.log('No cookies found!');
    }
    
    console.groupEnd();
    
    return allCookies;
  };

  // Combined useEffect for initialization
  useEffect(() => {
    // Check cookies and local storage for debugging
    const allCookies = document.cookie;
    setCookieDebug(allCookies);
    
    // Log cookies to console
    console.log('Cookie Debug [init]:', allCookies);
    dumpCookiesToConsole();
    
    // Regular authentication check
    checkAuth();
    
    // No need for checkAuth in the dependency array as it would cause an infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdminAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sudoPassword: adminPassword }),
      });
      
      if (response.ok) {
        setAuthenticated(true);
        fetchTeams();
      } else {
        const data = await response.json();
        setError(data.message || 'Authentication failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Auth error:', err);
    } finally {
      setLoading(false);
      setAdminPassword('');
    }
  };

  const handleAddTeam = async (e) => {
    e.preventDefault();
    
    // Basic validation
    if (!newTeam.teamName || !newTeam.password) {
      setFormError('Team name and password are required');
      return;
    }
    
    if (newTeam.password.length < 6) {
      setFormError('Password must be at least 6 characters');
      return;
    }
    
    setFormError('');
    setLoading(true);
    
    try {
      const response = await fetch('/api/admin/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamName: newTeam.teamName,
          password: newTeam.password
        }),
      });
      
      if (response.ok) {
        // Reset form and refresh team list
        setNewTeam({ teamName: '', password: '' });
        fetchTeams();
      } else {
        const data = await response.json();
        setFormError(data.message || 'Failed to add team');
      }
    } catch (err) {
      setFormError('Network error. Please try again.');
      console.error('Add team error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTeam = async (teamName) => {
    if (!confirm(`Are you sure you want to delete ${teamName}?`)) {
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await fetch(`/api/admin/teams?team=${encodeURIComponent(teamName)}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        fetchTeams();
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to delete team');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Delete team error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    console.log("Starting logout process - cookies before deletion:", document.cookie);
    setCookieDebug("Before logout: " + document.cookie);
    console.log("Cookie Debug [before logout]:", document.cookie);

    // Start with the most complete possible browser-side cookie deletion
    function deleteCookie(name) {
      // Get domain parts for hierarchical deletion
      const domain = window.location.hostname;
      const domains = [];
      
      // Add domain and all parent domains
      const parts = domain.split('.');
      for (let i = 0; i < parts.length - 1; i++) {
        domains.push(parts.slice(i).join('.'));
      }
      
      // Also try with no domain
      domains.push('');
      
      // Get path for hierarchical deletion
      const path = window.location.pathname;
      const paths = ['/'];
      
      // Add current path and all parent paths
      let currentPath = '';
      const pathParts = path.split('/').filter(Boolean);
      for (let i = 0; i < pathParts.length; i++) {
        currentPath += '/' + pathParts[i];
        paths.push(currentPath);
        paths.push(currentPath + '/');
      }
      
      // Also try with empty path
      paths.push('');
      
      // Try all combinations of domains, paths and cookie settings
      domains.forEach(d => {
        const domainStr = d ? `domain=${d}; ` : '';
        
        paths.forEach(p => {
          const pathStr = p ? `path=${p}; ` : '';
          
          // Basic deletion
          document.cookie = `${name}=; ${domainStr}${pathStr}expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
          
          // With Secure flag
          document.cookie = `${name}=; ${domainStr}${pathStr}expires=Thu, 01 Jan 1970 00:00:00 UTC; secure;`;
          
          // With different SameSite values
          ['strict', 'lax', 'none'].forEach(sameSite => {
            if (sameSite === 'none') {
              // SameSite=None requires Secure
              document.cookie = `${name}=; ${domainStr}${pathStr}expires=Thu, 01 Jan 1970 00:00:00 UTC; secure; samesite=${sameSite};`;
            } else {
              document.cookie = `${name}=; ${domainStr}${pathStr}expires=Thu, 01 Jan 1970 00:00:00 UTC; samesite=${sameSite};`;
              document.cookie = `${name}=; ${domainStr}${pathStr}expires=Thu, 01 Jan 1970 00:00:00 UTC; secure; samesite=${sameSite};`;
            }
          });
        });
      });
    }
    
    // Delete the cookies
    deleteCookie('admin_auth');
    deleteCookie('auth_credentials');
    
    // Check if cookies were deleted
    setTimeout(() => {
      console.log("After client-side cookie deletion:", document.cookie);
      setCookieDebug("After client deletion: " + document.cookie);
      console.log("Cookie Debug [after client deletion]:", document.cookie);
    }, 100);

    // Generate a unique logout ID
    const logoutId = Date.now().toString();
    
    // Call the server-side logout API
    fetch('/api/admin/logout', { 
      method: 'POST',
      credentials: 'include',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
    .then(response => {
      console.log("Logout API response status:", response.status);
      if (!response.ok) {
        console.error('Logout API returned error:', response.status);
      }
      return response.json();
    })
    .then(data => {
      console.log("Logout API response:", data);
      setTimeout(() => {
        setCookieDebug("After server logout: " + document.cookie);
        console.log("Cookie Debug [after server logout]:", document.cookie);
      }, 100);
      
      // Also call team auth logout endpoint
      return fetch('/api/auth/validate', {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    })
    .then(response => {
      console.log("Auth validate DELETE response status:", response.status);
      return response.json();
    })
    .then(data => {
      console.log("Auth validate DELETE response:", data);
      setTimeout(() => {
        console.log("Final cookies before redirect:", document.cookie);
        setCookieDebug("Final: " + document.cookie);
        console.log("Cookie Debug [final]:", document.cookie);
  
        // Last resort - attempt to use the browser's clear site data feature
        try {
          if ('cookieStore' in window) {
            // Use modern Cookie Store API if available
            window.cookieStore.getAll().then(cookies => {
              cookies.forEach(cookie => {
                window.cookieStore.delete(cookie.name);
              });
            });
          }
        } catch (e) {
          console.error("Error using cookieStore:", e);
        }
        
        // Force a complete page reload to clear any in-memory auth state
        setAuthenticated(false);
        
        // Use a timeout to give time for the UI to update
        setTimeout(() => {
          // Add special parameter for middleware to detect this logout
          window.location.href = `/?nocache=${logoutId}&logout=${logoutId}`;
        }, 300);
      }, 300);
    })
    .catch(err => {
      console.error('Logout error:', err);
      // Force redirect anyway with logout parameter
      window.location.href = `/?nocache=${Date.now()}&logout=${Date.now()}`;
    });
  };

  if (!authenticated) {
    return (
      <div className={styles.adminContainer}>
        <div className={styles.adminHeader}>
          <h1 className={styles.adminTitle}>Admin Authentication</h1>
        </div>
        
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>
              <LockIcon /> ADMIN Authentication
            </h2>
          </div>
          
          {error && <p className={styles.errorText}>{error}</p>}
          
          <form onSubmit={handleAdminAuth} className={styles.loginForm}>
            <div className={styles.formGroup}>
              <label htmlFor="adminPassword" className={styles.formLabel}>ADMIN Password</label>
              <input
                type="password"
                id="adminPassword"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className={styles.formInput}
                disabled={loading}
                autoComplete="off"
                autoFocus
                placeholder="Enter administrator password"
              />
            </div>
            <button 
              type="submit" 
              className={styles.submitButton}
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.adminContainer}>
      <div className={styles.adminHeader}>
        <h1 className={styles.adminTitle}>Team Authentication Management</h1>
        <div>
          <button 
            onClick={dumpCookiesToConsole}
            className={styles.debugButton || styles.refreshButton}
            title="Dump cookies to console"
            style={{ marginRight: '10px' }}
          >
            Console Log
          </button>
          <button 
            onClick={() => setShowDebugUI(!showDebugUI)}
            className={styles.debugButton || styles.refreshButton}
            title="Toggle debug info"
            style={{ marginRight: '10px' }}
          >
            {showDebugUI ? 'Hide Debug' : 'Show Debug'}
          </button>
          <button 
            onClick={handleLogout}
            className={styles.logoutButton}
          >
            <LogoutIcon /> Logout
          </button>
        </div>
      </div>
      
      {cookieDebug && showDebugUI && (
        <div className={styles.debugInfo}>
          <h3>Cookie Debug Info</h3>
          <pre>{cookieDebug || 'No cookies found'}</pre>
          <button 
            onClick={() => {
              const allCookies = dumpCookiesToConsole();
              setCookieDebug(allCookies);
            }}
            className={styles.refreshButton}
          >
            Refresh Cookie Info
          </button>
        </div>
      )}
      
      <div className={styles.adminContent}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>
              <TeamIcon /> Add New Team
            </h2>
          </div>
          
          {formError && <p className={styles.errorText}>{formError}</p>}
          
          <form onSubmit={handleAddTeam} className={styles.loginForm}>
            <div className={styles.formGroup}>
              <label htmlFor="teamName" className={styles.formLabel}>Team Name</label>
              <input
                type="text"
                id="teamName"
                value={newTeam.teamName}
                onChange={(e) => setNewTeam({...newTeam, teamName: e.target.value})}
                className={styles.formInput}
                disabled={loading}
                placeholder="Enter team name"
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="password" className={styles.formLabel}>Password</label>
              <input
                type="password"
                id="password"
                value={newTeam.password}
                onChange={(e) => setNewTeam({...newTeam, password: e.target.value})}
                className={styles.formInput}
                disabled={loading}
                placeholder="Enter team password (min 6 characters)"
              />
            </div>
            <button 
              type="submit" 
              className={styles.submitButton}
              disabled={loading}
            >
              {loading ? 'Adding...' : 'Add Team'}
            </button>
          </form>
        </div>
        
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>
              <TeamIcon /> Registered Teams
            </h2>
          </div>
          
          {error && <p className={styles.errorText}>{error}</p>}
          
          {loading ? (
            <p className={styles.loadingText}>Loading teams...</p>
          ) : teams.length === 0 ? (
            <p className={styles.emptyState}>No teams registered yet. Add your first team above.</p>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.teamTable}>
                <thead>
                  <tr>
                    <th>Team Name</th>
                    <th>Created</th>
                    <th>Last Login</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => (
                    <tr key={team.id}>
                      <td>{team.team_name}</td>
                      <td>{new Date(team.created_at).toLocaleString()}</td>
                      <td>{team.last_login ? new Date(team.last_login).toLocaleString() : 'Never'}</td>
                      <td>
                        <button 
                          onClick={() => handleDeleteTeam(team.team_name)}
                          className={styles.deleteButton}
                          disabled={loading}
                          title="Delete team"
                        >
                          <TrashIcon /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 