import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// Create a database connection pool for verifying credentials
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
});

// Add a way to track logout state using URL parameter
const logoutTimestamps = new Map();
const LOGOUT_EXPIRY_TIME = 30 * 60 * 1000; // 30 minutes

export async function middleware(request) {
  // Check for explicit logout parameter in URL
  if (request.nextUrl.searchParams.has('logout')) {
    const logoutId = request.nextUrl.searchParams.get('logout');
    if (logoutId) {
      // Store timestamp of logout 
      logoutTimestamps.set(logoutId, Date.now());
      console.log(`Registered logout session: ${logoutId}`);
      
      // Redirect to home without the logout parameter
      const cleanUrl = new URL('/', request.url);
      return NextResponse.redirect(cleanUrl);
    }
  }
  
  // Check if request has a logout session that's still valid
  const cookies = request.cookies.getAll();
  const cookieHeader = request.headers.get('cookie');
  const hasLogoutParam = request.nextUrl.searchParams.has('nocache');
  
  if (hasLogoutParam) {
    const nocacheValue = request.nextUrl.searchParams.get('nocache');
    const isRecentLogout = logoutTimestamps.has(nocacheValue) && 
                          (Date.now() - logoutTimestamps.get(nocacheValue) < LOGOUT_EXPIRY_TIME);
                          
    if (isRecentLogout) {
      console.log(`Recent logout detected (${nocacheValue}), forcing redirect to home`);
      // Redirect to home without the nocache parameter
      const cleanUrl = new URL('/', request.url);
      return NextResponse.redirect(cleanUrl);
    }
  }

  // ALWAYS ALLOW ACCESS TO THESE RESOURCES
  if (
    // Entry points and public pages
    request.nextUrl.pathname === '/' || 
    request.nextUrl.pathname === '' ||
    request.nextUrl.pathname === '/admin' ||
    
    // Static assets and internals
    request.nextUrl.pathname.startsWith('/_next/') ||
    request.nextUrl.pathname === '/favicon.ico' ||
    request.nextUrl.pathname === '/manifest.json' ||
    request.nextUrl.pathname.startsWith('/icons/') ||
    request.nextUrl.pathname.startsWith('/apple-touch-icon') ||
    request.nextUrl.pathname === '/sw.js' ||
    request.nextUrl.pathname.startsWith('/workbox-') ||
    
    // API endpoints - authentication handled internally
    request.nextUrl.pathname.startsWith('/api/') ||
    
    // CRITICAL FIX: Allow the login page and registration flow
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname === '/register' ||
    request.nextUrl.pathname.startsWith('/auth/')
  ) {
    return NextResponse.next();
  }

  console.log(`Middleware checking auth for: ${request.nextUrl.pathname}`);
  
  // For all other routes, check for auth cookie in multiple ways
  let authCredentials = request.cookies.get('auth_credentials');
  let adminAuth = request.cookies.get('admin_auth');
  
  // Debug cookie information
  console.log(`Auth cookie from request.cookies: ${authCredentials ? 'EXISTS' : 'MISSING'}`);
  console.log(`Admin auth cookie from request.cookies: ${adminAuth ? 'EXISTS' : 'MISSING'}`);
  
  // Try to get from local storage via header
  if (!authCredentials?.value) {
    // Try to manually parse cookie header as a fallback
    const cookieHeader = request.headers.get('cookie');
    console.log(`Raw cookie header: ${cookieHeader ? `present (${cookieHeader.length} bytes)` : 'missing'}`);
    
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').map(c => c.trim());
      console.log(`Parsed ${cookies.length} cookies from header: ${cookies.join(', ')}`);
      
      const authCookie = cookies.find(c => c.startsWith('auth_credentials='));
      if (authCookie) {
        const value = authCookie.substring('auth_credentials='.length);
        console.log(`Found auth_credentials in raw cookie header: ${value ? 'has value' : 'empty'}`);
        authCredentials = { value };
      }

      // Also look for admin_auth cookie
      const adminCookie = cookies.find(c => c.startsWith('admin_auth='));
      if (adminCookie) {
        const value = adminCookie.substring('admin_auth='.length);
        console.log(`Found admin_auth in raw cookie header: ${value ? 'has value' : 'empty'}`);
        adminAuth = { value };
      }
    }
    
    // List all cookies for debugging
    const allCookies = request.cookies.getAll();
    console.log(`All cookies from request.cookies (${allCookies.length}): ${allCookies.map(c => c.name).join(', ')}`);
  }
  
  // Also check headers directly
  const authorization = request.headers.get('authorization');
  if (!authCredentials?.value && authorization?.startsWith('Basic ')) {
    console.log('Found auth in Authorization header');
    const value = authorization.substring('Basic '.length);
    authCredentials = { value };
  }
  
  // Check for nocache parameter - indicates a recent logout
  if (request.nextUrl.searchParams.has('nocache')) {
    console.log('Detected nocache parameter - recent logout');
    console.log('Overriding authentication due to recent logout');
    
    // Force a redirect to home page
    const url = new URL('/', request.url);
    return NextResponse.redirect(url);
  }
  
  // Pre-declare our auth validation variables
  let adminAuthValid = false;
  let authValid = false;

  // Validate auth_credentials against database if present
  if (authCredentials?.value) {
    try {
      const decoded = Buffer.from(authCredentials.value, 'base64').toString('utf-8');
      console.log(`Auth credentials decoded: ${decoded.includes(':') ? 'VALID FORMAT' : 'INVALID FORMAT'}`);
      
      // Only proceed if we have a valid format
      if (decoded.includes(':')) {
        const [teamName, password] = decoded.split(':');
        
        // SIMPLIFIED LOGIC: Allow users with valid credential format to continue
        if (teamName && password && password.length >= 4) {  // Reduced minimum to 4 characters
          console.log(`User with valid credential format detected: ${teamName}`);
          
          // Create persistent cookie response
          const response = NextResponse.next();
          
          // Check for iOS user agent
          const userAgent = request.headers.get('user-agent') || '';
          const isIOS = /iPad|iPhone|iPod/.test(userAgent);
          
          if (isIOS) {
            console.log('iOS device detected, applying special cookie settings');
            // iOS-specific cookie settings - Safari has stricter handling
            response.cookies.set('auth_credentials', authCredentials.value, {
              maxAge: 30 * 24 * 60 * 60, // 30 days
              path: '/',
              httpOnly: true,
              secure: true, // Always use secure for iOS
              sameSite: 'none' // Using 'none' for iOS which has stricter handling
            });
          } else {
            // Standard cookie for other browsers
            response.cookies.set('auth_credentials', authCredentials.value, {
              maxAge: 30 * 24 * 60 * 60, // 30 days
              path: '/',
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax'
            });
          }
          
          // Validate against database without blocking navigation
          try {
            const client = await pool.connect();
            const result = await client.query(
              'SELECT team_name FROM team_auth WHERE team_name = $1',
              [teamName]
            );
            
            const existsInDb = result.rowCount > 0;
            console.log(`Team ${teamName} database validation: ${existsInDb ? 'EXISTS' : 'NOT FOUND'}`);
            
            // If team found in database, ensure cookie persistence
            if (existsInDb) {
              const response = NextResponse.next();
              
              // Check for iOS user agent
              const userAgent = request.headers.get('user-agent') || '';
              const isIOS = /iPad|iPhone|iPod/.test(userAgent);
              
              if (isIOS) {
                console.log('iOS device detected, applying special cookie settings (DB user)');
                // iOS-specific cookie settings - Safari has stricter handling
                response.cookies.set('auth_credentials', authCredentials.value, {
                  maxAge: 30 * 24 * 60 * 60, // 30 days
                  path: '/',
                  httpOnly: true,
                  secure: true, // Always use secure for iOS
                  sameSite: 'none' // Using 'none' for iOS which has stricter handling
                });
              } else {
                // Standard cookie for other browsers
                response.cookies.set('auth_credentials', authCredentials.value, {
                  maxAge: 30 * 24 * 60 * 60, // 30 days
                  path: '/',
                  httpOnly: true,
                  secure: process.env.NODE_ENV === 'production',
                  sameSite: 'lax'
                });
              }
              
              if (client) client.release();
              return response;
            }
            
            // If team not found, FORCE LOGOUT IMMEDIATELY
            if (!existsInDb) {
              console.log(`Team ${teamName} not found in database - FORCING IMMEDIATE LOGOUT`);
              
              // Generate a unique logout ID for tracking
              const forceLogoutId = Date.now().toString();
              logoutTimestamps.set(forceLogoutId, Date.now());
              
              // Build response with deleted cookies
              const response = NextResponse.redirect(new URL('/', request.url));
              
              // Add URL parameters to signal logout
              response.cookies.delete('auth_credentials', { path: '/' });
              response.cookies.delete('admin_auth', { path: '/' });
              
              // Also try with various combinations for maximum compatibility
              ['lax', 'strict'].forEach(sameSite => {
                response.cookies.set('auth_credentials', '', { 
                  maxAge: 0,
                  path: '/',
                  expires: new Date(0),
                  sameSite
                });
                
                response.cookies.set('admin_auth', '', { 
                  maxAge: 0,
                  path: '/',
                  expires: new Date(0),
                  sameSite
                });
              });
              
              // For cross-site contexts
              response.cookies.set('auth_credentials', '', { 
                maxAge: 0,
                path: '/',
                expires: new Date(0),
                sameSite: 'none',
                secure: true
              });
              
              response.cookies.set('admin_auth', '', { 
                maxAge: 0,
                path: '/',
                expires: new Date(0),
                sameSite: 'none',
                secure: true
              });
              
              // Add nocache param to prevent browser caching
              const redirectUrl = new URL('/', request.url);
              redirectUrl.searchParams.set('nocache', forceLogoutId);
              redirectUrl.searchParams.set('logout', forceLogoutId);
              redirectUrl.searchParams.set('reason', 'deleted');
              
              response.headers.set('Location', redirectUrl.toString());
              
              if (client) client.release();
              return response;
            }
          } catch (dbError) {
            console.error('Database validation error:', dbError.message || dbError);
            // NEVER fall back to format validation on database errors
            // Better to deny access than risk security breach
            authValid = false;
            console.log('DB validation error, DENYING ACCESS');
          } finally {
            if (client) client.release();
          }
        } else {
          // Invalid format, go through strict database validation
          let client = null;
          try {
            client = await pool.connect();
            const result = await client.query(
              'SELECT team_name FROM team_auth WHERE team_name = $1',
              [teamName]
            );
            
            authValid = result.rowCount > 0;
            console.log(`Team ${teamName} database validation: ${authValid ? 'EXISTS' : 'NOT FOUND'}`);
            
            // If team found in database, ensure cookie persistence
            if (authValid) {
              const response = NextResponse.next();
              
              // Check for iOS user agent
              const userAgent = request.headers.get('user-agent') || '';
              const isIOS = /iPad|iPhone|iPod/.test(userAgent);
              
              if (isIOS) {
                console.log('iOS device detected, applying special cookie settings (DB user)');
                // iOS-specific cookie settings - Safari has stricter handling
                response.cookies.set('auth_credentials', authCredentials.value, {
                  maxAge: 30 * 24 * 60 * 60, // 30 days
                  path: '/',
                  httpOnly: true,
                  secure: true, // Always use secure for iOS
                  sameSite: 'none' // Using 'none' for iOS which has stricter handling
                });
              } else {
                // Standard cookie for other browsers
                response.cookies.set('auth_credentials', authCredentials.value, {
                  maxAge: 30 * 24 * 60 * 60, // 30 days
                  path: '/',
                  httpOnly: true,
                  secure: process.env.NODE_ENV === 'production',
                  sameSite: 'lax'
                });
              }
              
              if (client) client.release();
              return response;
            }
            
            // If team not found, FORCE LOGOUT IMMEDIATELY
            if (!authValid) {
              console.log(`Team ${teamName} not found in database - FORCING IMMEDIATE LOGOUT`);
              
              // Generate a unique logout ID for tracking
              const forceLogoutId = Date.now().toString();
              logoutTimestamps.set(forceLogoutId, Date.now());
              
              // Build response with deleted cookies
              const response = NextResponse.redirect(new URL('/', request.url));
              
              // Add URL parameters to signal logout
              response.cookies.delete('auth_credentials', { path: '/' });
              response.cookies.delete('admin_auth', { path: '/' });
              
              // Also try with various combinations for maximum compatibility
              ['lax', 'strict'].forEach(sameSite => {
                response.cookies.set('auth_credentials', '', { 
                  maxAge: 0,
                  path: '/',
                  expires: new Date(0),
                  sameSite
                });
                
                response.cookies.set('admin_auth', '', { 
                  maxAge: 0,
                  path: '/',
                  expires: new Date(0),
                  sameSite
                });
              });
              
              // For cross-site contexts
              response.cookies.set('auth_credentials', '', { 
                maxAge: 0,
                path: '/',
                expires: new Date(0),
                sameSite: 'none',
                secure: true
              });
              
              response.cookies.set('admin_auth', '', { 
                maxAge: 0,
                path: '/',
                expires: new Date(0),
                sameSite: 'none',
                secure: true
              });
              
              // Add nocache param to prevent browser caching
              const redirectUrl = new URL('/', request.url);
              redirectUrl.searchParams.set('nocache', forceLogoutId);
              redirectUrl.searchParams.set('logout', forceLogoutId);
              redirectUrl.searchParams.set('reason', 'deleted');
              
              response.headers.set('Location', redirectUrl.toString());
              
              if (client) client.release();
              return response;
            }
          } catch (dbError) {
            console.error('Database validation error:', dbError.message || dbError);
            // NEVER fall back to format validation on database errors
            // Better to deny access than risk security breach
            authValid = false;
            console.log('DB validation error, DENYING ACCESS');
          } finally {
            if (client) client.release();
          }
        }
      }
    } catch (e) {
      console.error('Auth credentials validation error:', e);
    }
  }
  
  // Also validate admin_auth more thoroughly
  if (adminAuth?.value) {
    try {
      // URL decode first (important for handling %3D etc.)
      const decodedValue = decodeURIComponent(adminAuth.value);
      
      // Use Buffer instead of atob for server components
      const decoded = Buffer.from(decodedValue, 'base64').toString('utf-8');
      console.log(`Admin auth decoded, checking format and credentials`);
      
      const [username, password] = decoded.split(':');
      
      if (username && password) {
        console.log(`Admin auth has valid format, username: ${username}`);
        // STRICT validation against environment variable
        if (username === 'admin' && password === process.env.ADMIN_PASSWORD) {
          adminAuthValid = true;
          console.log(`Admin auth validation: VALID`);
        } else {
          adminAuthValid = false;
          console.log(`Admin auth validation: INVALID - Forcing immediate logout`);
          
          // Generate a unique logout ID to track
          const forceLogoutId = Date.now().toString();
          logoutTimestamps.set(forceLogoutId, Date.now());
          
          // Build response with aggressive cookie deletion
          const response = NextResponse.redirect(new URL('/', request.url));
          
          // Delete all auth cookies with multiple approaches
          response.cookies.delete('auth_credentials', { path: '/' });
          response.cookies.delete('admin_auth', { path: '/' });
          
          // Also try with various combinations
          ['lax', 'strict'].forEach(sameSite => {
            response.cookies.set('auth_credentials', '', { 
              maxAge: 0,
              path: '/',
              expires: new Date(0),
              sameSite
            });
            
            response.cookies.set('admin_auth', '', { 
              maxAge: 0,
              path: '/',
              expires: new Date(0),
              sameSite
            });
          });
          
          // For cross-site contexts
          response.cookies.set('auth_credentials', '', { 
            maxAge: 0,
            path: '/',
            expires: new Date(0),
            sameSite: 'none',
            secure: true
          });
          
          response.cookies.set('admin_auth', '', { 
            maxAge: 0,
            path: '/',
            expires: new Date(0),
            sameSite: 'none',
            secure: true
          });
          
          // Add URL parameters to trigger proper logout handling
          const redirectUrl = new URL('/', request.url);
          redirectUrl.searchParams.set('nocache', forceLogoutId);
          redirectUrl.searchParams.set('logout', forceLogoutId);
          redirectUrl.searchParams.set('reason', 'invalid');
          
          response.headers.set('Location', redirectUrl.toString());
          return response;
        }
      } else {
        console.log(`Admin auth validation failed: Invalid format`);
      }
    } catch (e) {
      console.error('Admin auth validation error:', e.message || e);
    }
  }
  
  if (authValid || adminAuthValid) {
    // Allow access if either auth credential is valid
    console.log("Auth found, allowing access");
    return NextResponse.next();
  }
  
  // Add a hook for testing in development mode
  if (process.env.NODE_ENV !== 'production' && request.headers.get('x-override-auth') === 'true') {
    console.log("Dev auth override header found, allowing access");
    return NextResponse.next();
  }
  
  // If auth_credentials cookie doesn't exist, redirect to homepage
  console.log("Auth not found, redirecting to homepage");
  const url = new URL('/', request.url);
  url.searchParams.set('authRequired', 'true');
  url.searchParams.set('redirect', request.nextUrl.pathname);
  return NextResponse.redirect(url);
} 