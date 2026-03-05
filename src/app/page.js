"use client";
import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import Header from "./form-components/Header";
import TextInput from "./form-components/TextInput";
import DynamicFormRenderer from "./form-components/DynamicFormRenderer";
import styles from "./page.module.css";
import compactStyles from "./compact.module.css";
import AuthDialog from "./form-components/AuthDialog";
import JSConfetti from 'js-confetti';
import QRCode from "qrcode";
import pako from 'pako';
import base58 from 'base-58';
import { toast, Toaster } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { getFormDefaults, getAllFields } from '../lib/form-renderer';

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
  const [showClearFormDialog, setShowClearFormDialog] = useState(false);

  // Active game configuration state
  const [activeGameConfig, setActiveGameConfig] = useState(null);
  const [gameConfigLoading, setGameConfigLoading] = useState(true);
  const [gameConfigError, setGameConfigError] = useState(null);

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
            // Auth definitively failed — clear and show login dialog
            clearAuthCookies();
            setAuthCredentials(null);
            setShowAuthDialog(true);
          }
        }).catch(() => {
          // Network error — navigate anyway and let server middleware validate
          window.location.href = target;
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
      // Re-throw so callers can distinguish a real auth failure (returns false)
      // from a transient network/abort error (throws). This prevents a fetch
      // abort caused by page navigation from being treated as "logged out".
      throw error;
    }
  };

  // Simplified helper function - let server handle cookies
  const setAuthCookies = (credentials) => {
    if (!credentials) return;

    console.log("Storing auth credentials in browser storage");

    // Store in localStorage for direct access
    localStorage.setItem('auth_credentials', credentials);

    // Store in sessionStorage for session persistence
    sessionStorage.setItem('auth_credentials', credentials);

    // Don't set client-side cookies - let the server handle this to avoid conflicts
    console.log("Client-side storage updated, server will handle cookies");

    // Dispatch a custom event to notify other pages that auth has been updated
    try {
      window.dispatchEvent(new CustomEvent('auth_updated', {
        detail: { timestamp: Date.now() }
      }));
    } catch (e) {
      console.error('Error dispatching auth event:', e);
    }
  };

  // Helper function to clear auth storage and notify server
  const clearAuthCookies = () => {
    // Clear all storage
    localStorage.removeItem('auth_credentials');
    sessionStorage.removeItem('auth_credentials');
    console.log("Clearing auth storage");

    // Don't clear cookies directly - let the server handle this
    console.log("Notifying server to clear session");

    // Notify server to clear session
    try {
      fetch('/api/auth/session', {
        method: 'DELETE',
        credentials: 'same-origin'
      });
    } catch (e) {
      console.log("Server session clearing failed");
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
        console.log(`Skipping check, last successful validation was ${timeSinceLastCheck / 1000}s ago`);
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

    window.history.pushState = function () {
      originalPushState.apply(this, arguments);
      handleNavigation();
    };

    window.history.replaceState = function () {
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

  // Fetch active game configuration on mount
  useEffect(() => {
    const fetchActiveGame = async () => {
      try {
        setGameConfigLoading(true);
        setGameConfigError(null);

        const response = await fetch(`/api/admin/games/active?_ts=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.config) {
            setActiveGameConfig({
              gameId: data.gameId,
              gameName: data.gameName,
              displayName: data.displayName,
              tableName: data.tableName,
              config: data.config,
            });
            console.log('[Form] Loaded active game:', data.displayName);
          } else {
            console.warn('[Form] No active game configured');
            setGameConfigError('No active game configured. Contact admin to set up a game.');
          }
        } else {
          console.error('[Form] Failed to fetch active game');
          setGameConfigError('Failed to load game configuration.');
        }
      } catch (error) {
        console.error('[Form] Error fetching active game:', error);
        setGameConfigError('Error loading game configuration.');
      } finally {
        setGameConfigLoading(false);
      }
    };

    fetchActiveGame();
  }, []);

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
            console.log("Credentials validated successfully, server will handle cookies");
          } else {
            // If validation definitively failed (authenticated: false), clear credentials
            clearAuthCookies();
            setAuthCredentials(null);
          }
        }).catch(err => {
          // Network or abort error — do NOT clear the session.
          // The server-side middleware validates the httpOnly session cookie on every
          // request, so a transient fetch failure here is harmless.
          console.log("Credential check network error, preserving existing auth:", err.message);
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
    // Generate a generic TSV from form data fields
    const config = activeGameConfig?.config;
    const fields = config ? getAllFields(config) : [];

    const values = [
      data.scoutname || "NULL",
      data.match || "NULL",
      data.team || "NULL",
      data.noshow ? "TRUE" : "FALSE",
    ];

    // Add all config-driven fields in order
    fields.forEach(field => {
      const val = data[field.name];
      if (field.type === 'checkbox') {
        values.push(val ? "TRUE" : "FALSE");
      } else if (field.type === 'comment') {
        values.push(val || "NULL");
      } else {
        values.push(val ?? 0);
      }
    });

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

    // Initialize with config-driven defaults
    const configDefaults = activeGameConfig?.config ? getFormDefaults(activeGameConfig.config) : {};
    let data = {
      matchtype: 2, // Default matchtype: Qualification
      scoutteam: "5895", // Will be replaced by auth credentials if available
      ...configDefaults,
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
          data[element.name] = element.value !== '' ? Number(element.value) : 0;
        } else if (element.type === 'textarea') {
          data[element.name] = element.value.trim() || null;
        } else {
          data[element.name] = element.value || null;
        }
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
      if (preMatchInput.value == "" || preMatchInput.value <= "0") {
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
    data.__meta = {
      gameId: activeGameConfig?.gameId ?? null,
      gameName: activeGameConfig?.gameName ?? null,
    };

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

    // Check if game config is loaded
    if (!activeGameConfig && !gameConfigLoading) {
      toast.error('No active game configured. Please contact your admin to set up a game.');
      return;
    }

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
      // Check if game config is loaded
      if (!activeGameConfig && !gameConfigLoading) {
        toast.error('No active game configured. Please contact your admin to set up a game.');
        setIsSubmitting(false);
        return;
      }

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
          "Authorization": `Basic ${authCredentials}`,
          ...(activeGameConfig?.gameId ? { "X-Game-Id": String(activeGameConfig.gameId) } : {}),
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

      // Notify mounted components to clear their localStorage before unmounting
      window.dispatchEvent(new CustomEvent('reset_form_components'));

      // Force complete component reset by incrementing the key
      setFormResetKey(prev => prev + 1);

      // Indicate successful submission and hide dialog after a delay
      setTimeout(() => {
        setShowSubmitDialog(false);

        // Show confetti
        new JSConfetti().addConfetti({
          emojis: ['🦴', '🧱', '☀️', '⭐'],
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

    // Notify mounted components to clear their localStorage before unmounting
    window.dispatchEvent(new CustomEvent('reset_form_components'));

    // Force complete component reset by incrementing the key
    setFormResetKey(prev => prev + 1);

    // Show confetti with a slight delay
    setTimeout(() => {
      new JSConfetti().addConfetti({
        emojis: ['🦴', '🧱', '☀️', '⭐'],
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

        // Check for specific auth error types
        let errorMsg = urlParams.get('error');
        if (urlParams.get('sessionRevoked') === 'true') {
          errorMsg = 'Your session has been revoked by an administrator. Please log in again.';
        } else if (urlParams.get('tokenInvalidated') === 'true') {
          errorMsg = 'Your session has been invalidated. Please log in again.';
        } else if (urlParams.get('dbError') === 'true') {
          errorMsg = 'Authentication system temporarily unavailable. Please try again.';
        }

        if (errorMsg) {
          setAuthError(errorMsg);
        }

        // Clear the URL parameters to avoid showing the message repeatedly
        if (window.history && window.history.replaceState) {
          const newUrl = window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
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

      {/* Game configuration status banner */}
      {gameConfigLoading && (
        <div style={{
          background: 'rgba(255, 193, 7, 0.2)',
          border: '1px solid #ffc107',
          color: '#ffc107',
          padding: '12px 16px',
          margin: '8px',
          borderRadius: '6px',
          textAlign: 'center',
          fontSize: '14px'
        }}>
          Loading game configuration...
        </div>
      )}

      {gameConfigError && (
        <div style={{
          background: 'rgba(229, 62, 62, 0.2)',
          border: '1px solid #e53e3e',
          color: '#fc8181',
          padding: '12px 16px',
          margin: '8px',
          borderRadius: '6px',
          textAlign: 'center',
          fontSize: '14px'
        }}>
          <strong>Warning:</strong> {gameConfigError}
          <br />
          <small>Form may not submit correctly. Please contact your admin.</small>
        </div>
      )}

      {activeGameConfig && (
        <div style={{
          background: 'rgba(56, 161, 105, 0.15)',
          border: '1px solid #38a169',
          color: '#68d391',
          padding: '8px 12px',
          margin: '8px',
          borderRadius: '6px',
          textAlign: 'center',
          fontSize: '13px'
        }}>
          Active Game: <strong>{activeGameConfig.displayName}</strong>
        </div>
      )}

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
        style={{ display: (showQRCode || showSubmitDialog || showAuthDialog || showClearFormDialog) ? 'none' : 'block' }}
      >
        <Header headerName={activeGameConfig?.config?.formTitle || "5895 SCOUTER"} className={compactStyles.header} />
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
        </div>

        {/* Dynamic form content based on active game config */}
        <DynamicFormRenderer
          config={activeGameConfig?.config}
          noShow={noShow}
          setNoShow={setNoShow}
          breakdown={breakdown}
          setBreakdown={setBreakdown}
          defense={defense}
          setDefense={setDefense}
        />

        {!gameConfigLoading && !activeGameConfig && (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: '#999',
            fontSize: '16px'
          }}>
            No active game configuration. Please contact your admin to set up a game.
          </div>
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
          <button
            id="clearform"
            type="button"
            onClick={() => setShowClearFormDialog(true)}
            className={`${styles.ClearFormButton} ${compactStyles.ClearFormButton || ''}`}
          >
            CLEAR FORM
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

                  {formData && !formData.noshow && activeGameConfig?.config && (
                    <>
                      {activeGameConfig.config.sections
                        ?.filter(section => !section.hidden && (!section.showWhen || formData[section.showWhen.field] === section.showWhen.equals))
                        .map((section) => (
                          <div key={section.id} className={styles.SummarySection}>
                            <h4>{section.header}</h4>
                            <ul className={styles.SummaryList}>
                              {getAllFields({ sections: [section] }).map(field => {
                                const val = formData[field.name];
                                if (val === undefined || val === null) return null;
                                const label = field.label || field.subHeader || field.name;
                                if (field.type === 'checkbox') {
                                  return <li key={field.name}><strong>{label}:</strong> {val ? "Yes" : "No"}</li>;
                                }
                                if (field.type === 'comment') {
                                  return val ? <li key={field.name}><strong>{label}:</strong> {val}</li> : null;
                                }
                                if (field.type === 'singleSelect') {
                                  const opt = field.options?.find(o => o.value === val);
                                  return <li key={field.name}><strong>{label}:</strong> {opt?.label ?? val}</li>;
                                }
                                if (field.type === 'starRating' || field.type === 'qualitative') {
                                  return <li key={field.name}><strong>{label}:</strong> {val}/6</li>;
                                }
                                return <li key={field.name}><strong>{label}:</strong> {val}</li>;
                              })}
                            </ul>
                          </div>
                        ))}
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

      {/* Clear Form Confirmation Dialog */}
      {showClearFormDialog && (
        <div className={styles.QRCodeOverlay}>
          <div className={styles.QRCodeContainer}>
            <h2 className={styles.qrTitle}>Clear Form</h2>
            <p style={{ color: 'white', textAlign: 'center', marginBottom: '24px', fontSize: '18px' }}>
              Are you sure you want to clear all form data?
            </p>
            <div className={styles.SubmitButtons}>
              <button
                className={styles.SubmitButton}
                onClick={() => {
                  setShowClearFormDialog(false);
                  setNoShow(false);
                  setBreakdown(false);
                  setDefense(false);
                  window.dispatchEvent(new CustomEvent('reset_form_components'));
                  setFormResetKey(prev => prev + 1);
                }}
              >
                Clear
              </button>
              <button
                className={styles.CancelButton}
                onClick={() => setShowClearFormDialog(false)}
              >
                Cancel
              </button>
            </div>
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
