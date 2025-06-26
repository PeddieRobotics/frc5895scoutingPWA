"use client";
import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import Header from "./form-components/Header";
import TextInput from "./form-components/TextInput";
import styles from "./page.module.css";
import compactStyles from "./compact.module.css";
import NumericInput from "./form-components/NumericInput";
import Checkbox from "./form-components/Checkbox";
import CommentBox from "./form-components/CommentBox";
import EndPlacement from "./form-components/EndPlacement";
import SubHeader from "./form-components/SubHeader";
import AuthDialog from "./form-components/AuthDialog";
import JSConfetti from 'js-confetti';
import QRCode from "qrcode";
import pako from 'pako';
import base58 from 'base-58';
import { toast, Toaster } from 'react-hot-toast';
import IntakeOptions from "./form-components/IntakeOptions";
import Qualitative from "./form-components/Qualitative";
import { useRouter } from 'next/navigation';

export default function Home() {
  const [noShow, setNoShow] = useState(false);
  const [breakdown, setBreakdown] = useState(false);
  const [defense, setDefense] = useState(false);
  const [scoutProfile, setScoutProfile] = useState(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [formData, setFormData] = useState(null);
  const [qrCodeDataURL1, setQrCodeDataURL1] = useState("");
  const [qrCodeDataURL2, setQrCodeDataURL2] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [uploadStatus, setUploadStatus] = useState("");
  const [submissionResult, setSubmissionResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authCredentials, setAuthCredentials] = useState(null);
  const [authRedirectTarget, setAuthRedirectTarget] = useState(null);
  const [formResetKey, setFormResetKey] = useState(0);
  
  const form = useRef();
  const router = useRouter();

  // Handle auth required from URL
  const handleAuthRequired = useCallback((required) => {
    if (required && !authCredentials) {
      setShowAuthDialog(true);
    }
  }, [authCredentials]);

  // Handle redirect target
  const handleRedirectTarget = useCallback((target) => {
    if (target) {
      setAuthRedirectTarget(target);
      
      // If we have credentials, validate them before redirecting
      if (authCredentials) {
        // Check credentials validity
        validateCredentials(authCredentials).then(isValid => {
          if (isValid) {
            window.location.href = target;
          } else {
            // If validation failed, clear credentials and show auth dialog
            clearAuthCookies();
            setAuthCredentials(null);
            setShowAuthDialog(true);
          }
        });
      }
    }
  }, [authCredentials]);

  // Add a function to validate credentials
  const validateCredentials = async (credentials) => {
    try {
      console.log("Validating credentials...");
      
      // Add random number to further prevent any caching
      const timestamp = new Date().getTime();
      const random = Math.random().toString(36).substring(2);
      const response = await fetch(`/api/auth/validate?_t=${timestamp}&_r=${random}`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'X-Random': random // Adding a random header to further prevent caching
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
      
      console.log(`Auth validation result: status=${response.status}, authenticated=${data.authenticated}`);
      
      if (response.ok && data.authenticated === true) {
        // Set cookies to avoid repeated validation
        console.log("Authentication successful, setting auth data");
        
        // Store in sessionStorage (reliable in-browser storage)
        sessionStorage.setItem('auth_credentials', credentials);
        
        // Set cookies with different SameSite attributes for maximum compatibility
        setAuthCookies(credentials);
        
        // Also try to ensure server-side cookies are set
        try {
          console.log("Ensuring server-side cookies are set");
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
          console.log("Server cookie setting failed, using client-side cookies");
        }
        
        console.log("Successfully validated credentials in client-side");
        return true;
      }
      
      // Mark as failed validation
      console.log("Failed to validate credentials in client-side");
      return false;
    } catch (error) {
      console.error("Error validating credentials:", error);
      return false;
    }
  };

  // Helper function to set auth cookies with multiple approaches
  const setAuthCookies = (credentials) => {
    if (!credentials) return;
    
    console.log("Setting auth cookies with multiple approaches");
    
    // Store in localStorage for direct access
    localStorage.setItem('auth_credentials', credentials);
    
    // Store in sessionStorage for session persistence
    sessionStorage.setItem('auth_credentials', credentials);
    
    // Determine if we're in a secure context (HTTPS or localhost)
    const isSecureContext = window.location.protocol === 'https:' || 
                           window.location.hostname === 'localhost' ||
                           window.location.hostname.includes('.vercel.app');
    
    // Store raw base64 credentials in cookies (no JSON wrapper)
    const rawCreds = credentials;

    // Set cookie with path=/ (standard cookie)
    document.cookie = `auth_credentials=${rawCreds}; path=/; max-age=2592000`;

    // Set SameSite=Lax cookie
    document.cookie = `auth_credentials=${rawCreds}; path=/; max-age=2592000; SameSite=Lax`;

    // Set SameSite=None;Secure cookie if secure context
    if (isSecureContext) {
      document.cookie = `auth_credentials=${rawCreds}; path=/; max-age=2592000; SameSite=None; Secure`;
      console.log("Set secure cookie for HTTPS/preview environment");
    } else {
      console.log("Not setting Secure cookie as we're not in a secure context");
    }
    
    // Dispatch a custom event to notify other pages that auth has been updated
    try {
      window.dispatchEvent(new CustomEvent('auth_updated', {
        detail: { timestamp: Date.now() }
      }));
    } catch (e) {
      console.error('Error dispatching auth event:', e);
    }
    
    console.log("Auth cookies set with multiple approaches for maximum compatibility");
  };

  // Helper function to clear auth cookies
  const clearAuthCookies = () => {
    // Clear all storage
    localStorage.removeItem('auth_credentials');
    sessionStorage.removeItem('auth_credentials');
    console.log("Clearing auth cookies and storage");
    
    // Clear cookies with all possible attributes
    document.cookie = `auth_credentials=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
    document.cookie = `auth_credentials=; path=/; max-age=0`;
    document.cookie = `auth_credentials=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax`;
    document.cookie = `auth_credentials=; path=/; max-age=0; SameSite=Lax`;
    document.cookie = `auth_credentials=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure`;
    document.cookie = `auth_credentials=; path=/; max-age=0; SameSite=None; Secure`;
    
    console.log("All auth cookies and storage cleared");
    
    // Also try to clear via server
    try {
      fetch('/api/auth/validate', {
        method: 'DELETE',
        credentials: 'same-origin'
      });
    } catch (e) {
      console.log("Server cookie clearing failed");
    }
  };

  // Set up polling to periodically check if credentials are still valid
  useEffect(() => {
    // Only set up polling if we have credentials
    if (!authCredentials || typeof window === 'undefined') return;
    
    let isPollingActive = true; // Flag to track if component is still mounted
    let checkTimer = null;
    let visibilityChangeAttached = false;
    let lastSuccessfulValidation = Date.now(); // Track last successful validation
    
    // Listen for auth update events from other tabs/pages
    const handleAuthUpdated = (event) => {
      console.log("Auth updated event received, refreshing cookies");
      // Get current credentials from storage
      const currentCreds = sessionStorage.getItem('auth_credentials') || 
                         localStorage.getItem('auth_credentials');
      if (currentCreds) {
        // Re-apply cookie settings to ensure consistency
        setAuthCookies(currentCreds);
      }
    };
    
    // Add auth updated event listener
    window.addEventListener('auth_updated', handleAuthUpdated);
    
    // Function to check credentials and log out if invalid
    const checkCredentials = async (force = false) => {
      if (!isPollingActive) return; // Skip if component was unmounted
      
      // Don't run if document is hidden unless forced
      if (!force && document.hidden) {
        console.log("Page is hidden, skipping credential check until visible");
        return;
      }
      
      // Skip if checked successfully within the last 10 seconds (unless forced)
      // Reducing from 30s to 10s to check more frequently
      const timeSinceLastCheck = Date.now() - lastSuccessfulValidation;
      if (!force && timeSinceLastCheck < 10000) {
        console.log(`Skipping check, last successful validation was ${timeSinceLastCheck/1000}s ago`);
        scheduleNextCheck();
        return;
      }
      
      console.log(`Checking credential validity... (timestamp: ${new Date().toISOString()})`);
      
      try {
        // Always use the validate endpoint which checks against the database
        const isValid = await validateCredentials(authCredentials);
        
        if (!isPollingActive) return; // Check again in case validation took a while
        
        if (!isValid) {
          console.log(`Credential validation failed, logging out (${new Date().toISOString()})`);
          handleAuthFailure();
        } else {
          console.log(`Credentials validated successfully (${new Date().toISOString()})`);
          // Update last successful validation time
          lastSuccessfulValidation = Date.now();
          // Schedule next check
          scheduleNextCheck();
        }
      } catch (error) {
        console.error("Error during credential polling:", error);
        // Still schedule next check on error
        scheduleNextCheck();
      }
    };
    
    // Schedule the next check
    const scheduleNextCheck = () => {
      if (!isPollingActive) return;
      
      // Clear any existing timer
      if (checkTimer) {
        clearTimeout(checkTimer);
      }
      
      // Set a new timer (10 seconds when page is visible, 30 seconds when hidden)
      // Reduced from 20/60 to 10/30 to check more frequently
      const interval = document.hidden ? 30000 : 10000;
      checkTimer = setTimeout(() => checkCredentials(), interval);
    };
    
    // Force a credential check when user navigates within the app 
    const handleNavigation = () => {
      // Always validate on navigation
      console.log("Navigation detected, checking credentials");
      checkCredentials(true);
    };
    
    // Handle page visibility changes
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Always check when page becomes visible again - this catches credential changes
        console.log("Page became visible, checking credentials immediately");
        checkCredentials(true);
      } else {
        console.log("Page became hidden, rescheduling check with longer timeout");
        // Page became hidden, reschedule with longer timeout
        scheduleNextCheck();
      }
    };
    
    // Attach visibility change listener
    if (!visibilityChangeAttached) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      visibilityChangeAttached = true;
    }
    
    // Force a credential check when user interacts with the page
    const handleUserInteraction = (e) => {
      // On form submission or navigation actions, always validate
      if (e.type === 'submit' || 
          (e.target && (
            e.target.tagName === 'A' || 
            e.target.closest('a') || 
            e.target.closest('button')
          ))) {
        console.log("Critical interaction detected (link/button/form), validating credentials");
        checkCredentials(true);
        return;
      }
      
      // For other interactions, use a debounce approach
      // Don't check on every interaction, use a debounce of 5 seconds
      if (window.lastInteractionCheck && 
          (Date.now() - window.lastInteractionCheck) < 5000) {
        return;
      }
      
      window.lastInteractionCheck = Date.now();
      console.log("User interaction detected, triggering credential check");
      checkCredentials(true);
    };
    
    // List of events to capture user interaction
    const interactionEvents = ['click', 'keydown', 'touchstart', 'submit'];
    
    // Listen for user interactions
    interactionEvents.forEach(event => {
      window.addEventListener(event, handleUserInteraction);
    });
    
    // Also hook into the browser's history API for SPA navigation
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    
    window.history.pushState = function() {
      originalPushState.apply(this, arguments);
      handleNavigation();
    };
    
    window.history.replaceState = function() {
      originalReplaceState.apply(this, arguments);
      handleNavigation();
    };
    
    // Add handler for popstate events (back/forward navigation)
    window.addEventListener('popstate', handleNavigation);
    
    // Check immediately on mount or when credentials change
    checkCredentials(true);
    
    // Clean up on unmount
    return () => {
      console.log("Cleaning up auth polling");
      isPollingActive = false;
      if (checkTimer) {
        clearTimeout(checkTimer);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      interactionEvents.forEach(event => {
        window.removeEventListener(event, handleUserInteraction);
      });
      window.removeEventListener('popstate', handleNavigation);
      window.removeEventListener('auth_updated', handleAuthUpdated);
      
      // Restore original history methods if they exist
      if (window.history && originalPushState) {
        window.history.pushState = originalPushState;
      }
      if (window.history && originalReplaceState) {
        window.history.replaceState = originalReplaceState;
      }
    };
  }, [authCredentials, validateCredentials, setAuthCookies, clearAuthCookies]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedProfile = localStorage.getItem("ScoutProfile");
      if (savedProfile) {
        const profileData = JSON.parse(savedProfile);
        setScoutProfile(profileData);
        
        // Directly set form values after a short delay to ensure form is mounted
        setTimeout(() => {
          if (form.current) {
            const scoutNameInput = form.current.querySelector('input[name="scoutname"]');
            if (scoutNameInput && profileData.scoutname) {
              scoutNameInput.value = profileData.scoutname;
            }
            
            const matchInput = form.current.querySelector('input[name="match"]');
            if (matchInput && profileData.match) {
              matchInput.value = profileData.match;
            }
          }
        }, 100);
      }
      
      // Check online status
      setIsOnline(navigator.onLine);
      window.addEventListener('online', () => setIsOnline(true));
      window.addEventListener('offline', () => setIsOnline(false));
      
      // Check for stored auth credentials
      let credentials = null;
      
      // First check sessionStorage
      const storedCredentials = sessionStorage.getItem('auth_credentials');
      if (storedCredentials) {
        credentials = storedCredentials;
      } else {
        // If not in sessionStorage, check cookies
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
          const cookie = cookies[i].trim();
          if (cookie.startsWith('auth_credentials=')) {
            credentials = cookie.substring('auth_credentials='.length);
            // Store back in sessionStorage for future use
            sessionStorage.setItem('auth_credentials', credentials);
            break;
          }
        }
      }
      
      // If credentials were found in either location, validate and set them
      if (credentials) {
        validateCredentials(credentials).then(isValid => {
          if (isValid) {
            setAuthCredentials(credentials);
            
            // Ensure cookie is set with a long expiration (30 days)
            console.log("Setting auth_credentials cookie in client-side with value");
            document.cookie = `auth_credentials=${credentials}; path=/; max-age=2592000; SameSite=None; Secure`;
            console.log("Client cookie set with SameSite=None; Secure");
          } else {
            // If validation failed, clear credentials
            clearAuthCookies();
            setAuthCredentials(null);
          }
        });
      }
      
      return () => {
        window.removeEventListener('online', () => setIsOnline(true));
        window.removeEventListener('offline', () => setIsOnline(false));
      };
    }
  }, []);

  // Add auth event listener for 401 responses
  useEffect(() => {
    const handleAuthRequiredEvent = (event) => {
      console.log('Received auth:required event, showing auth dialog');
      setAuthCredentials(null);
      clearAuthCookies();
      
      if (event.detail && event.detail.message) {
        setAuthError(event.detail.message);
      } else {
        setAuthError('Authentication required');
      }
      
      setShowAuthDialog(true);
    };
    
    // Listen for the custom event
    window.addEventListener('auth:required', handleAuthRequiredEvent);
    
    // Also check the URL for authRequired when the component mounts
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('authRequired') === 'true') {
      const errorMsg = urlParams.get('error');
      if (errorMsg) {
        setAuthError(errorMsg);
      }
      setShowAuthDialog(true);
    }
    
    return () => {
      window.removeEventListener('auth:required', handleAuthRequiredEvent);
    };
  }, []);

  const generateTabSeparatedString = (data) => {
    const boolToSheets = (value) => value ? "TRUE" : "FALSE";
    
    const autoCoralL1L2 = (data.autol1success || 0) + (data.autol2success || 0);
    const autoCoralMissed = 
      (data.autol1fail || 0) + 
      (data.autol2fail || 0) + 
      (data.autol3fail || 0) + 
      (data.autol4fail || 0) +
      (data.autoprocessorfail || 0);
  
    const teleCoralL1L2 = (data.telel1success || 0) + (data.telel2success || 0);
    const teleCoralMissed = 
      (data.telel1fail || 0) + 
      (data.telel2fail || 0) + 
      (data.telel3fail || 0) + 
      (data.telel4fail || 0) +
      (data.teleprocessorfail || 0);
  
    // Use endlocation (DB value) for the export
    const climbStatus = data.endlocation || 1; // Default to None (1)
    const parked = climbStatus === 2 ? "TRUE" : "FALSE";  // 2 = Parked in DB (both Park and Fail+Park)
    const shallowClimb = climbStatus === 3 ? "TRUE" : "FALSE"; // 3 = Shallow in DB
    const deepClimb = climbStatus === 4 ? "TRUE" : "FALSE"; // 4 = Deep in DB
  
    const notes = [
      data.breakdowncomments,
      data.defensecomments,
      data.generalcomments
    ].filter(Boolean).join("; ") || "NULL";

    const values = [
      data.scoutname || "NULL",
      data.match || "NULL",
      data.team || "NULL",
      boolToSheets(!data.noshow),
      "NULL",
      boolToSheets(data.leave),
      data.autol1success || 0,
      data.autol2success || 0,
      data.autol3success || 0,
      data.autol4success || 0,
      data.autoprocessorsuccess || 0,
      data.autonetsuccess || 0,
      autoCoralMissed,
      data.telel1success || 0,
      data.telel2success || 0,
      data.telel3success || 0,
      data.telel4success || 0,
      data.teleprocessorsuccess || 0,
      data.telenetsuccess || 0,
      teleCoralMissed,
      "NULL",
      parked,
      shallowClimb,
      deepClimb,
      notes
    ];
  
    return values.join("\t");
  };

  const generateQRDataURL = async (data) => {
    try {
      const compressedData = pako.gzip(new TextEncoder().encode(JSON.stringify(data)));
      const base58Encoded = base58.encode(compressedData);
  
      // Generate original QR code
      const dataURL1 = await QRCode.toDataURL(base58Encoded, {
        width: 400,
        margin: 3,
        errorCorrectionLevel: 'L'
      });
  
      // Generate TSV QR code
      const tsvString = generateTabSeparatedString(data);
      const dataURL2 = await QRCode.toDataURL(tsvString, {
        width: 400,
        margin: 3,
        errorCorrectionLevel: 'L'
      });
  
      setQrCodeDataURL1(dataURL1);
      setQrCodeDataURL2(dataURL2);
    } catch (error) {
      console.error("Error generating QR code:", error);
    }
  };

  useEffect(() => {
    if (formData) {
      generateQRDataURL(formData);
    }
  }, [formData]);

  function onNoShowChange(e) {
    // Update the component state based on checkbox state
    const isChecked = e.target.checked;
    console.log(`NoShow checkbox changed to: ${isChecked}`);
    setNoShow(isChecked);
    // The rendering of conditional content is already handled by the JSX
    // through the {!noShow && ( ... )} conditional rendering
  }

  function onBreakdownChange(e) {
    setBreakdown(e.target.checked);
  }

  function onDefenseChange(e) {
    setDefense(e.target.checked);
  }

  async function processFormData(e) {
    if (e) e.preventDefault();
    
    if (!form.current) {
      console.error("Form reference is missing");
      return null;
    }
    
    // Initialize with default values
    let data = {
      noshow: false, 
      leave: false, 
      breakdown: false, 
      defense: false, 
      stageplacement: -1, 
      endlocation: null, // Initialize endlocation field
      matchtype: 2, // Set the default matchtype to Qualification (2)
      breakdowncomments: null, 
      defensecomments: null, 
      generalcomments: null,
      scoutteam: "5895", // This will be replaced if auth credentials exist
      // Explicitly include all form fields with defaults
      autol1success: 0, autol1fail: 0,
      autol2success: 0, autol2fail: 0,
      autol3success: 0, autol3fail: 0,
      autol4success: 0, autol4fail: 0,
      autoprocessorsuccess: 0, autoprocessorfail: 0,
      autonetsuccess: 0, autonetfail: 0,
      autoalgaeremoved: 0,
      telel1success: 0, telel1fail: 0,
      telel2success: 0, telel2fail: 0,
      telel3success: 0, telel3fail: 0,
      telel4success: 0, telel4fail: 0,
      teleprocessorsuccess: 0, teleprocessorfail: 0,
      telenetsuccess: 0, telenetfail: 0,
      telealgaeremoved: 0,
      coralgrndintake: false,
      coralstationintake: false,
      algaegrndintake: false,
      algaehighreefintake: false,
      algaelowreefintake: false,
      // Qualitative ratings
      defenseplayed: 0,
      // Remove other qualitative ratings
      coralspeed: null,
      processorspeed: null,
      netspeed: null,
      algaeremovalspeed: null,
      climbspeed: null,
      maneuverability: null,
      defenseevasion: null,
      aggression: null,
      cagehazard: null
    };
    
    try {
      // Get all form elements
      const formElements = form.current.elements;
      for (let i = 0; i < formElements.length; i++) {
        const element = formElements[i];
        
        // Skip buttons and elements without a name
        if (!element.name || element.tagName === 'BUTTON') continue;
        
        console.log(`Processing form element: ${element.name}, type: ${element.type}, value: ${element.value}`);
        
        if (element.type === 'checkbox') {
          data[element.name] = element.checked;
        } else if (element.type === 'radio') {
          if (element.checked) {
            data[element.name] = parseInt(element.value) || element.value;
          }
        } else if (element.type === 'number' || element.type === 'tel') {
          // Convert to number if not empty
          data[element.name] = element.value !== '' ? Number(element.value) : 0;
        } else if (element.type === 'textarea') {
          // For comment boxes
          data[element.name] = element.value.trim() || null;
        } else {
          data[element.name] = element.value || null;
        }
      }
      
      // Directly check for stageplacement radio buttons
      const stagePlacementRadios = form.current.querySelectorAll('input[name="stageplacement"]');
      let foundCheckedPlacement = false;
      for (let radio of stagePlacementRadios) {
        if (radio.checked) {
          // Get the placement value from the radio button
          const rawPlacementValue = parseInt(radio.value);
          
          // Map the form values to the database values:
          // Form values from EndPlacement.js:
          // 0=None, 1=Park, 2=Fail+Park, 3=Shallow, 4=Deep
          // DB expects: 1=None, 2=Park/Fail+Park, 3=Shallow, 4=Deep
          let mappedValue;
          switch(rawPlacementValue) {
            case 0: // None in form
              mappedValue = 0; // None in DB
              break;
            case 1: // Park in form
              mappedValue = 1; // Park in DB
              break;
            case 2: // Fail+Park in form
              mappedValue = 2; // Also considered as Parked in DB
              break;
            case 3: // Shallow cage in form
              mappedValue = 3; // Shallow in DB
              break;
            case 4: // Deep cage in form
              mappedValue = 4; // Deep in DB
              break;
            default:
              mappedValue = 0; // Default to None in DB
          }
          
          // Store both the raw form value and the mapped DB value
          data.stageplacement = rawPlacementValue;
          data.endlocation = mappedValue;
          
          foundCheckedPlacement = true;
          break;
        }
      }
      
      // If no placement was selected, explicitly set to no selection
      if (!foundCheckedPlacement) {
        data.stageplacement = 0; // 0 = None in the form
        data.endlocation = 1;    // 1 = None in the DB
      }
      
      // Ensure comments are captured
      const commentBoxes = form.current.querySelectorAll('textarea');
      commentBoxes.forEach(box => {
        if (box.name && box.value.trim()) {
          data[box.name] = box.value.trim();
        }
      });
    } catch (err) {
      console.error("Error processing form data:", err);
    }

    // Validate pre-match data
    let preMatchInputs = document.querySelectorAll(".preMatchInput");
    for (let preMatchInput of preMatchInputs) {
      if(preMatchInput.value == "" || preMatchInput.value <= "0") {
        alert("Invalid Pre-Match Data!");
        return null; 
      } 
    }

    // Get scout team from auth credentials if available
    if (authCredentials) {
      try {
        const decodedCredentials = atob(authCredentials);
        const [teamName, _] = decodedCredentials.split(':');
        if (teamName) {
          data.scoutteam = teamName;
        }
      } catch (error) {
        console.error("Error extracting scoutteam from auth credentials:", error);
      }
    }

    data.timestamp = new Date().toISOString();
    data.id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    console.log("Processed form data:", data);
    return data;
  }
  
  async function generateQRCode(e) {
    // Important: Prevent default but DO NOT reset the form
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    const data = await processFormData(e);
    if (!data) return;
    
    // Store form data without touching the form
    setFormData(data);
    setShowQRCode(true);
  }
  
  async function handleSubmitOnline(e) {
    // Prevent default form submission behavior
    if (e) e.preventDefault();
    
    // Process the form data without modifying the form's state
    const data = await processFormData(e);
    if (!data) return;
    
    // Store form data as a snapshot for the summary dialog only
    // This doesn't affect the actual form or any UI state
    setFormData(data);
    
    // If we don't have authentication credentials, show auth dialog first
    if (!authCredentials) {
      setShowAuthDialog(true);
      return;
    }
    
    // Show the submission dialog overlay
    setShowSubmitDialog(true);
  }
  
  const submitDataOnline = async () => {
    try {
      // If no auth credentials, show auth dialog
      if (!authCredentials) {
        setShowSubmitDialog(false);
        setShowAuthDialog(true);
        return;
      }
      
      // Create a copy of the form data to submit
      const submissionData = { ...formData };
      
      // Show loading indicator
      setIsSubmitting(true);
      const toastId = toast.loading("Submitting data...");
      
      console.log("Submitting data:", submissionData);
      
      // Make the API call with authentication
      const response = await fetch("/api/add-match-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${authCredentials}`
        },
        body: JSON.stringify(submissionData),
      });
      
      if (!response.ok) {
        // Try to get more details about the error
        let errorText = `Error: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData && errorData.message) {
            errorText = `${errorText} - ${errorData.message}`;
          }
        } catch (e) {
          // If we can't parse the JSON, just use the status text
          errorText = `${errorText} - ${response.statusText}`;
        }
        
        if (response.status === 401) {
          // Authentication failed, clear credentials and show auth dialog
          clearAuthCookies();
          setAuthCredentials(null);
          setShowSubmitDialog(false);
          setShowAuthDialog(true);
          setAuthError("Your session has expired. Please log in again.");
          console.log("Clearing auth cookies after auth failure in data submission");
          throw new Error("Authentication failed");
        }
        
        throw new Error(errorText);
      }
      
      // Dismiss loading toast and show success message
      toast.dismiss(toastId);
      toast.success("Data submitted successfully!");
      
      // Use the helper function to update scout profile consistently
      updateScoutProfile(submissionData);
      
      // Set submission result
      setSubmissionResult({ success: true });
      
      // Reset React state controls
      setNoShow(false);
      setBreakdown(false);
      setDefense(false);
      
      // Force complete component reset by incrementing the key
      setFormResetKey(prev => prev + 1);
      
      // Indicate successful submission and hide dialog after a delay
      setTimeout(() => {
        setShowSubmitDialog(false);
        
        // Show confetti
        new JSConfetti().addConfetti({
          emojis: ['🐠', '🐡', '🦀', '🪸'],
          emojiSize: 100,
          confettiRadius: 3,
          confettiNumber: 100,
        });
        
        // Clear temporary states after hiding the dialog
        setFormData(null);
        setSubmissionResult(null);
        setUploadStatus("");
        setIsSubmitting(false);
      }, 500);
      
      return true;
    } catch (error) {
      // Error handling - don't modify the form, just show the error
      console.error("Error submitting data:", error);
      
      // Set more detailed error information
      setUploadStatus(error.message || "Unknown error occurred");
      
      // Dismiss loading toast and show error message
      toast.dismiss();
      if (error.message !== "Authentication failed") {
        toast.error(`Failed to submit data: ${error.message}`);
        setSubmissionResult({ success: false });
      }
      setIsSubmitting(false);
      return false;
    }
  };
  
  const handleQRClose = () => {
    setShowQRCode(false);
    
    // Use the helper function to update scout profile consistently
    updateScoutProfile(formData);
    
    // Reset React state controls
    setNoShow(false);
    setBreakdown(false);
    setDefense(false);
    
    // Force complete component reset by incrementing the key
    setFormResetKey(prev => prev + 1);
    
    // Show confetti with a slight delay 
    setTimeout(() => {
      new JSConfetti().addConfetti({
        emojis: ['🐠', '🐡', '🦀', '🪸'],
        emojiSize: 100,
        confettiRadius: 3,
        confettiNumber: 100,
      });
    }, 100);
    
    // Clear stored form data
    setFormData(null);
    setSubmissionResult(null);
    setUploadStatus("");
  };
  
  const handleQRCancel = () => {
    // Simply hide the QR code dialog without resetting the form
    setShowQRCode(false);
    
    // Clear temporary QR code data
    setQrCodeDataURL1("");
    setQrCodeDataURL2("");
  };
  
  const handleSubmitClose = () => {
    // Just hide the dialog - when submissionResult is set to success, 
    // the submitDataOnline function already handles the form reset
    setShowSubmitDialog(false);
    
    // If submission failed, clear the result so they can try again
    if (submissionResult && !submissionResult.success) {
      setSubmissionResult(null);
      setIsSubmitting(false);
    }
  };
  
  const handleCancelSubmit = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // ONLY hide the confirmation dialog without affecting any form data or state
    // This preserves all user input when canceling the submission
    setShowSubmitDialog(false);
    
    // No need to reset any UI states since we didn't modify them when showing the dialog
    // No need to call form.reset() since we want to keep all user input intact
  };
  
  // Add a proper form initialization function that runs only once
  // This should be the ONLY place other than resetForm() that 
  // directly modifies form elements
  const initializeForm = useCallback(() => {
    if (form.current && scoutProfile) {
      if (scoutProfile.scoutname) {
        const scoutNameInput = form.current.querySelector('input[name="scoutname"]');
        if (scoutNameInput) scoutNameInput.value = scoutProfile.scoutname;
      }
      
      if (scoutProfile.match) {
        const matchInput = form.current.querySelector('input[name="match"]');
        if (matchInput) matchInput.value = scoutProfile.match;
      }
    }
  }, [scoutProfile]);

  // Add useEffect to initialize form values when profile changes
  useEffect(() => {
    initializeForm();
  }, [scoutProfile, initializeForm]);

  // Make the button click handlers completely safe
  const handleOnlineSubmitClick = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    handleSubmitOnline(e);
  };
  
  const handleQRButtonClick = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    generateQRCode(e);
  };

  // Helper function to update scout profile after successful submission
  const updateScoutProfile = (submittedData) => {
    if (typeof window !== 'undefined' && submittedData) {
      // Create new profile with incremented match number
      const newProfile = {
        scoutname: submittedData.scoutname || (scoutProfile ? scoutProfile.scoutname : ""),
        scoutteam: submittedData.scoutteam || "5895",
        match: Number(submittedData.match || 0) + 1,
      };
      
      // Update state and local storage
      setScoutProfile(newProfile);
      localStorage.setItem("ScoutProfile", JSON.stringify(newProfile));
      
      // If the form is visible, make sure the UI is updated
      if (form.current) {
        const scoutNameInput = form.current.querySelector('input[name="scoutname"]');
        if (scoutNameInput) scoutNameInput.value = newProfile.scoutname;
        
        const matchInput = form.current.querySelector('input[name="match"]');
        if (matchInput) matchInput.value = newProfile.match;
      }
    }
  };

  // Handle authentication success
  const handleAuthSuccess = useCallback((credentials, scoutTeam) => {
    setAuthCredentials(credentials);
    setShowAuthDialog(false);
    setAuthError('');
    
    // If we have a redirect target, navigate there
    if (authRedirectTarget) {
      console.log(`Auth success, redirecting to: ${authRedirectTarget}`);
      
      // Instead of immediately redirecting, wait a moment to ensure cookies are set
      // and recognized by the browser, especially on iOS
      setTimeout(() => {
        // Use window.location for a hard navigation rather than the router
        // This forces a complete page load with the new auth state
        window.location.href = authRedirectTarget;
      }, 300);
      
      return;
    }
    
    // Update the scout team in the form if one is provided
    if (scoutTeam) {
      // Store it in the scoutProfile
      const currentProfile = scoutProfile || {};
      const updatedProfile = {
        ...currentProfile,
        scoutteam: scoutTeam
      };
      setScoutProfile(updatedProfile);
      localStorage.setItem("ScoutProfile", JSON.stringify(updatedProfile));
    }
  }, [authRedirectTarget, scoutProfile]);

  // Handle auth dialog close
  const handleAuthClose = () => {
    setShowAuthDialog(false);
    setAuthError("");
    
    // Clear the redirect target when canceling
    setAuthRedirectTarget(null);
    
    // Clear URL parameters when canceling auth
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.search = ''; // Remove all query parameters
      window.history.replaceState({}, '', url);
    }
  };

  // Function to handle authentication failure
  const handleAuthFailure = () => {
    console.log("Authentication failed, logging out user");
    
    // Clear auth cookies and state
    clearAuthCookies();
    setAuthCredentials(null);
    
    // Show a notification to the user
    toast.error('Your session has expired. Please log in again.');
    
    // If not on the homepage, redirect there
    if (window.location.pathname !== '/') {
      window.location.href = '/';
    } else {
      // If already on homepage, show the auth dialog
      setShowAuthDialog(true);
    }
  };

  // Check URL parameters on client-side only
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Use browser's built-in URLSearchParams API instead of Next.js hook
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('authRequired') === 'true') {
        handleAuthRequired(true);
        const redirect = urlParams.get('redirect');
        if (redirect) {
          handleRedirectTarget(redirect);
        }
        const errorMsg = urlParams.get('error');
        if (errorMsg) {
          setAuthError(errorMsg);
        }
      }
    }
  }, [handleAuthRequired, handleRedirectTarget]);

  // Add cookie synchronization effect
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Function to synchronize auth state from cookies to storage
    const syncAuthFromCookies = () => {
      try {
        // Check for auth cookies
        const cookies = document.cookie.split(';');
        let authCredentialsCookie = null;
        let authTokenCookie = null;
        
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'auth_credentials' && value) {
            authCredentialsCookie = decodeURIComponent(value);
          } else if (name === 'auth_token' && value) {
            authTokenCookie = decodeURIComponent(value);
          }
        }
        
        // If we have auth cookies but not in storage, restore them
        if (authCredentialsCookie && !localStorage.getItem('auth_credentials')) {
          console.log("Found auth_credentials in cookies but not in storage, restoring");
          localStorage.setItem('auth_credentials', authCredentialsCookie);
          sessionStorage.setItem('auth_credentials', authCredentialsCookie);
          setAuthCredentials(authCredentialsCookie);
        }
        
        // If we have auth token but not in localStorage, restore it
        if (authTokenCookie && !localStorage.getItem('auth_token')) {
          console.log("Found auth_token in cookies but not in storage, restoring");
          localStorage.setItem('auth_token', authTokenCookie);
          
          // Try to parse token expiry from cookie if available
          try {
            const tokenData = JSON.parse(authTokenCookie);
            if (tokenData && tokenData.exp) {
              localStorage.setItem('auth_token_expiry', tokenData.exp);
            }
          } catch (e) {
            console.log("Could not parse auth token JSON");
          }
        }
        
        // If we have credentials in storage but not in cookies, restore them to cookies
        const credentialsInStorage = localStorage.getItem('auth_credentials') || 
                                    sessionStorage.getItem('auth_credentials');
        
        if (credentialsInStorage && !authCredentialsCookie) {
          console.log("Found credentials in storage but not in cookies, restoring");
          setAuthCookies(credentialsInStorage);
        }
      } catch (e) {
        console.error("Error synchronizing auth state:", e);
      }
    };
    
    // Run synchronization on load
    syncAuthFromCookies();
    
    // Set up synchronization to run periodically
    const syncInterval = setInterval(syncAuthFromCookies, 10000); // Check every 10 seconds
    
    // Also run synchronization on visibility change (when tab is focused)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncAuthFromCookies();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(syncInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <div className={`${styles.MainDiv} ${compactStyles.MainDiv}`}>
      <Toaster position="top-center" />
      
      {/* Always render the form - don't conditionally render it, just conditionally hide it */}
      <form 
        key={formResetKey}
        ref={form} 
        name="Scouting Form" 
        className={`${styles.formContainer} ${compactStyles.formContainer}`}
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }}
        style={{ display: (showQRCode || showSubmitDialog || showAuthDialog) ? 'none' : 'block' }}
      >
        <Header headerName={"JÖRMUNSCOUTR"} className={compactStyles.header} />
        <div className={`${styles.allMatchInfo} ${compactStyles.allMatchInfo}`}>
          <div className={`${styles.MatchInfo} ${compactStyles.MatchInfo}`}>
            <TextInput 
              visibleName={"Scout Name:"} 
              internalName={"scoutname"} 
              defaultValue={scoutProfile?.scoutname || ""}
              className="preMatchInput"
            />
            <TextInput 
              visibleName={"Match #:"} 
              internalName={"match"} 
              defaultValue={scoutProfile?.match || ""}
              type={"tel"}
              pattern="[0-9]*"
              className="preMatchInput"
            />
          </div>
          <div className={`${styles.MatchInfo} ${compactStyles.MatchInfo}`}>
            <TextInput
              visibleName={"Team Scouted:"}
              internalName={"team"}
              type={"tel"}
              pattern="[0-9]*"
              className="preMatchInput"
            />
          </div>
          <div className={`${styles.MatchInfo} ${compactStyles.MatchInfo}`}>
            <Checkbox
              visibleName={"No Show"}
              internalName={"noshow"}
              changeListener={onNoShowChange}
              className="preMatchInput"
            />
          </div>
        </div>

        {!noShow && (
          <>
            <div className={`${styles.Auto} ${compactStyles.Auto}`}>
              <Header headerName={"Auto"} className={compactStyles.header} />
              <Checkbox visibleName={"Leave"} internalName={"leave"} className="leaveCheckbox" style={{ marginBottom: '10px' }} />
              <div className={`${styles.Coral} ${styles.componentSection} ${compactStyles.componentSection}`} style={{ paddingTop: '10px' }}>
                <SubHeader subHeaderName={"Coral"} className={compactStyles.subHeader} />
                <table className={`${styles.Table} ${styles.CoralTable} ${compactStyles.Table}`}>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Success</th>
                      <th>Fail</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><h2>L4</h2></td>
                      <td><NumericInput pieceType={"Success"} internalName={"autol4success"}/></td>
                      <td><NumericInput pieceType={"Fail"} internalName={"autol4fail"}/></td>
                      <td></td>
                    </tr>
                    <tr>
                      <td><h2>L3</h2></td>
                      <td><NumericInput pieceType={"Success"} internalName={"autol3success"}/></td>
                      <td><NumericInput pieceType={"Fail"} internalName={"autol3fail"}/></td>
                      <td></td>
                    </tr>
                    <tr>
                      <td><h2>L2</h2></td>
                      <td><NumericInput pieceType={"Success"} internalName={"autol2success"}/></td>
                      <td><NumericInput pieceType={"Fail"} internalName={"autol2fail"}/></td>
                      <td></td>
                    </tr>
                    <tr>
                      <td><h2>L1</h2></td>
                      <td><NumericInput pieceType={"Success"} internalName={"autol1success"}/></td>
                      <td><NumericInput pieceType={"Fail"} internalName={"autol1fail"}/></td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className={`${styles.AlgaeRemoved} ${styles.componentSection} ${compactStyles.componentSection}`}>
                <SubHeader subHeaderName={"Algae Removed"} className={compactStyles.subHeader} />
                <NumericInput pieceType={"Counter"} internalName={"autoalgaeremoved"}/>
              </div>
              <div className={`${styles.Processor} ${styles.componentSection} ${compactStyles.componentSection}`}>
                <SubHeader subHeaderName={"Processor"} className={compactStyles.subHeader} />
                <table className={`${styles.Table} ${styles.CoralTable} ${compactStyles.Table}`}>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Success</th>
                      <th>Fail</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td></td>
                      <td><NumericInput pieceType={"Success"} internalName={"autoprocessorsuccess"}/></td>
                      <td><NumericInput pieceType={"Fail"} internalName={"autoprocessorfail"}/></td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className={`${styles.Net} ${styles.componentSection} ${compactStyles.componentSection}`}>
                <SubHeader subHeaderName={"Net"} className={compactStyles.subHeader} />
                <table className={`${styles.Table} ${styles.CoralTable} ${compactStyles.Table}`}>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Success</th>
                      <th>Fail</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td></td>
                      <td><NumericInput pieceType={"Success"} internalName={"autonetsuccess"}/></td>
                      <td><NumericInput pieceType={"Fail"} internalName={"autonetfail"}/></td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`${styles.Auto} ${compactStyles.Auto}`}>
              <Header headerName={"Tele"} className={compactStyles.header} />
              <div className={`${styles.Coral} ${styles.componentSection} ${compactStyles.componentSection}`}>
                <SubHeader subHeaderName={"Coral"} className={compactStyles.subHeader} />
                <table className={`${styles.Table} ${styles.CoralTable} ${compactStyles.Table}`}>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Success</th>
                      <th>Fail</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><h2>L4</h2></td>
                      <td><NumericInput pieceType={"Success"} internalName={"telel4success"}/></td>
                      <td><NumericInput pieceType={"Fail"} internalName={"telel4fail"}/></td>
                      <td></td>
                    </tr>
                    <tr>
                      <td><h2>L3</h2></td>
                      <td><NumericInput pieceType={"Success"} internalName={"telel3success"}/></td>
                      <td><NumericInput pieceType={"Fail"} internalName={"telel3fail"}/></td>
                      <td></td>
                    </tr>
                    <tr>
                      <td><h2>L2</h2></td>
                      <td><NumericInput pieceType={"Success"} internalName={"telel2success"}/></td>
                      <td><NumericInput pieceType={"Fail"} internalName={"telel2fail"}/></td>
                      <td></td>
                    </tr>
                    <tr>
                      <td><h2>L1</h2></td>
                      <td><NumericInput pieceType={"Success"} internalName={"telel1success"}/></td>
                      <td><NumericInput pieceType={"Fail"} internalName={"telel1fail"}/></td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className={`${styles.AlgaeRemoved} ${styles.componentSection} ${compactStyles.componentSection}`}>
                <SubHeader subHeaderName={"Algae Removed"} className={compactStyles.subHeader} />
                <NumericInput pieceType={"Counter"} internalName={"telealgaeremoved"}/>
              </div>
              <div className={`${styles.Processor} ${styles.componentSection} ${compactStyles.componentSection}`}>
                <SubHeader subHeaderName={"Processor"} className={compactStyles.subHeader} />
                <table className={`${styles.Table} ${styles.CoralTable} ${compactStyles.Table}`}>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Success</th>
                      <th>Fail</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td></td>
                      <td><NumericInput pieceType={"Success"} internalName={"teleprocessorsuccess"}/></td>
                      <td><NumericInput pieceType={"Fail"} internalName={"teleprocessorfail"}/></td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className={`${styles.Net} ${styles.componentSection} ${compactStyles.componentSection}`}>
                <SubHeader subHeaderName={"Net"} className={compactStyles.subHeader} />
                <table className={`${styles.Table} ${styles.CoralTable} ${compactStyles.Table}`}>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Success</th>
                      <th>Fail</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td></td>
                      <td><NumericInput pieceType={"Success"} internalName={"telenetsuccess"}/></td>
                      <td><NumericInput pieceType={"Fail"} internalName={"telenetfail"}/></td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <CommentBox
                  visibleName={"General Comments"}
                  internalName={"generalcomments"}
                  className={compactStyles.commentBox}
              />

              <Checkbox 
                  visibleName={"Playing Defense?"} 
                  internalName={"defense"} 
                  changeListener={onDefenseChange}
                />
                {defense && (
                  <>
                    <CommentBox
                      visibleName={"Defense Elaboration"}
                      internalName={"defensecomments"}
                      className={compactStyles.commentBox}
                    />
                    <div className={`${styles.defenseRating} ${compactStyles.defenseRating}`}>
                      <Qualitative
                        visibleName="Defense Played"
                        internalName="defenseplayed"
                        description="Ability to Play Defense"
                        forcedMinRating={1}
                      />
                    </div>
                  </>
                )}    

            </div>

            <div className={`${styles.Endgame} ${compactStyles.Endgame}`}>
              <Header headerName={"Endgame"} className={compactStyles.header} />
              <EndPlacement className={compactStyles.endPlacement} />
            </div>

            <div className={`${styles.PostMatch} ${compactStyles.PostMatch}`}>
              <Header headerName={"Post-Match"} className={compactStyles.header} />
              <SubHeader subHeaderName={"Intake"} className={compactStyles.subHeader} />
              <IntakeOptions className={compactStyles.intakeOptions} />
              <Checkbox 
                visibleName={"Broke down?"} 
                internalName={"breakdown"} 
                changeListener={onBreakdownChange} 
              />
              {breakdown && (
                <CommentBox
                  visibleName={"Breakdown Elaboration"}
                  internalName={"breakdowncomments"}
                  className={compactStyles.commentBox}
                />
              )}
            </div>
          </>
        )}
        <div className={`${styles.SubmitButtons} ${compactStyles.SubmitButtons}`}>
          <button 
            id="qrbutton" 
            type="button" 
            onClick={handleQRButtonClick} 
            className={`${styles.QRButton} ${compactStyles.QRButton}`}
          >
            GENERATE QR CODE
          </button>
          <button 
            id="onlinesubmit" 
            type="button" 
            onClick={handleOnlineSubmitClick} 
            className={`${styles.OnlineSubmitButton} ${compactStyles.OnlineSubmitButton}`} 
            disabled={!isOnline}
          >
            {isOnline ? "SUBMIT ONLINE" : "OFFLINE MODE"}
          </button>
        </div>
      </form>

      {/* QR Code Overlay */}
      {showQRCode && (
        <div className={styles.QRCodeOverlay}>
          <div className={styles.QRCodeContainer}>
            <h2 className={styles.qrTitle}>Scan QR Code to Submit Form Data</h2>
            <div className={styles.QRCodeRow}>
              {qrCodeDataURL1 && <img src={qrCodeDataURL1} alt="JSON QR" className={styles.QRCodeImage} />}
            </div>
            <div className={styles.SubmitButtons}>
              <button onClick={handleQRClose} className={styles.SubmitButton}>Done</button>
              <button onClick={handleQRCancel} className={styles.CancelButton}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Dialog Overlay */}
      {showSubmitDialog && (
        <div className={styles.QRCodeOverlay}>
          <div className={styles.QRCodeContainer}>
            <h2 className={styles.qrTitle}>Submit Form Data Online</h2>
            
            {!submissionResult ? (
              <>
                <div className={styles.SubmitSummary}>
                  <h3>Data Summary</h3>
                  <div className={styles.SummaryMainDetails}>
                    <p><strong>Scout:</strong> {formData?.scoutname}</p>
                    <p><strong>Match:</strong> {formData?.match}</p>
                    <p><strong>Team:</strong> {formData?.team}</p>
                    <p><strong>No Show:</strong> {formData?.noshow ? "Yes" : "No"}</p>
                  </div>
                  
                  {formData && !formData.noshow && (
                    <>
                      <div className={styles.SummarySection}>
                        <h4>Auto</h4>
                        <p><strong>Leave:</strong> {formData.leave ? "Yes" : "No"}</p>
                        <p><strong>Coral:</strong></p>
                        <ul className={styles.SummaryList}>
                          <li>L1: {formData.autol1success || 0} success, {formData.autol1fail || 0} fail</li>
                          <li>L2: {formData.autol2success || 0} success, {formData.autol2fail || 0} fail</li>
                          <li>L3: {formData.autol3success || 0} success, {formData.autol3fail || 0} fail</li>
                          <li>L4: {formData.autol4success || 0} success, {formData.autol4fail || 0} fail</li>
                        </ul>
                        <p><strong>Algae Removed:</strong> {formData.autoalgaeremoved || 0}</p>
                        <p><strong>Processor:</strong> {formData.autoprocessorsuccess || 0} success, {formData.autoprocessorfail || 0} fail</p>
                        <p><strong>Net:</strong> {formData.autonetsuccess || 0} success, {formData.autonetfail || 0} fail</p>
                      </div>
                      
                      <div className={styles.SummarySection}>
                        <h4>Tele</h4>
                        <p><strong>Coral:</strong></p>
                        <ul className={styles.SummaryList}>
                          <li>L1: {formData.telel1success || 0} success, {formData.telel1fail || 0} fail</li>
                          <li>L2: {formData.telel2success || 0} success, {formData.telel2fail || 0} fail</li>
                          <li>L3: {formData.telel3success || 0} success, {formData.telel3fail || 0} fail</li>
                          <li>L4: {formData.telel4success || 0} success, {formData.telel4fail || 0} fail</li>
                        </ul>
                        <p><strong>Algae Removed:</strong> {formData.telealgaeremoved || 0}</p>
                        <p><strong>Processor:</strong> {formData.teleprocessorsuccess || 0} success, {formData.teleprocessorfail || 0} fail</p>
                        <p><strong>Net:</strong> {formData.telenetsuccess || 0} success, {formData.telenetfail || 0} fail</p>
                        <p><strong>Playing Defense:</strong> {formData.defense ? "Yes" : "No"}</p>
                        {formData.defense && (
                          <p><strong>Defense Rating:</strong> {formData.defenseplayed}/6</p>
                        )}
                      </div>
                      
                      <div className={styles.SummarySection}>
                        <h4>Endgame</h4>
                        <p><strong>Stage Placement:</strong> {
                          (() => {
                            // Use stageplacement for display since it has the raw form values
                            const placement = formData.stageplacement;
                            switch(placement) {
                              case 0: return "None";  // value=0 in EndPlacement.js
                              case 1: return "Park";  // value=1 in EndPlacement.js
                              case 2: return "Fail + Park";  // value=2 in EndPlacement.js
                              case 3: return "Shallow Cage";  // value=3 in EndPlacement.js
                              case 4: return "Deep Cage";  // value=4 in EndPlacement.js
                              default: return "None";
                            }
                          })()
                        }</p>
                      </div>
                      
                      <div className={styles.SummarySection}>
                        <h4>Intake Capabilities</h4>
                        <ul className={styles.SummaryList}>
                          <li><strong>Coral Ground:</strong> {formData.coralgrndintake ? "Yes" : "No"}</li>
                          <li><strong>Coral Station:</strong> {formData.coralstationintake ? "Yes" : "No"}</li>
                          <li><strong>Algae Ground:</strong> {formData.algaegrndintake ? "Yes" : "No"}</li>
                          <li><strong>Algae High Reef:</strong> {formData.algaehighreefintake ? "Yes" : "No"}</li>
                          <li><strong>Algae Low Reef:</strong> {formData.algaelowreefintake ? "Yes" : "No"}</li>
                        </ul>
                      </div>
                      
                      <div className={styles.SummarySection}>
                        <h4>Comments</h4>
                        {formData.generalcomments && (
                          <div className={styles.CommentBlock}>
                            <strong>General:</strong> {formData.generalcomments}
                          </div>
                        )}
                        
                        {formData.breakdown && formData.breakdowncomments && (
                          <div className={styles.CommentBlock}>
                            <strong>Breakdown:</strong> {formData.breakdowncomments}
                          </div>
                        )}
                        
                        {formData.defense && formData.defensecomments && (
                          <div className={styles.CommentBlock}>
                            <strong>Defense:</strong> {formData.defensecomments}
                          </div>
                        )}
                        
                        {!formData.generalcomments && !formData.breakdowncomments && !formData.defensecomments && (
                          <p>No comments provided</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className={styles.SubmitConfirm}>
                  <p>Are you sure you want to submit this data?</p>
                  <div className={styles.SubmitButtons}>
                    <button 
                      onClick={submitDataOnline} 
                      className={styles.SubmitButton} 
                      disabled={!isOnline || isSubmitting}
                    >
                      {isSubmitting ? "Submitting..." : "Submit"}
                    </button>
                    <button 
                      onClick={handleCancelSubmit} 
                      className={styles.CancelButton}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.SubmitResults}>
                <h3 className={submissionResult.success ? styles.SuccessText : styles.ErrorText}>
                  {submissionResult.success ? "Submission Successful!" : "Submission Failed"}
                </h3>
                <p>{uploadStatus}</p>
                <button onClick={handleSubmitClose} className={styles.SubmitButton}>
                  {submissionResult.success ? "Done" : "Close"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Auth Dialog */}
      <AuthDialog 
        isOpen={showAuthDialog} 
        onClose={handleAuthClose}
        onLogin={handleAuthSuccess}
        errorMessage={authError}
      />
    </div>
  );
}