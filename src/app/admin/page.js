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
  const [newTeam, setNewTeam] = useState({ teamName: '', password: '' });
  const [formError, setFormError] = useState('');
  const router = useRouter();

  // Check if user is already authenticated
  useEffect(() => {
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
          fetchTeams();
        }
      } catch (err) {
        console.error('Auth validation error:', err);
      }
    };
    
    checkAuth();
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
    fetch('/api/admin/logout', { method: 'POST' })
      .then(() => {
        setAuthenticated(false);
        router.push('/');
      })
      .catch(err => {
        console.error('Logout error:', err);
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
        <button 
          onClick={handleLogout}
          className={styles.logoutButton}
        >
          <LogoutIcon /> Logout
        </button>
      </div>
      
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