"use client";
import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams } from 'next/navigation';
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

// Create a separate component that uses useSearchParams
function AuthParameterHandler({ onAuthRequired, onRedirectTarget }) {
  const searchParams = useSearchParams();
  
  useEffect(() => {
    // Check if auth is required from URL parameter
    const authRequired = searchParams.get('authRequired');
    if (authRequired === 'true') {
      const redirect = searchParams.get('redirect');
      onAuthRequired(true);
      if (redirect) {
        onRedirectTarget(redirect);
        
        // Clear the URL parameters after processing to prevent redirect loops
        if (typeof window !== 'undefined') {
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        }
      }
    }
  }, [searchParams, onAuthRequired, onRedirectTarget]);
  
  return null;
}

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
      
      // If we have credentials, redirect immediately
      if (authCredentials) {
        window.location.href = target;
      }
    }
  }, [authCredentials]);

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
      
      // If credentials were found in either location, set them
      if (credentials) {
        setAuthCredentials(credentials);
        
        // Ensure cookie is set with a long expiration (30 days)
        document.cookie = `auth_credentials=${credentials}; path=/; max-age=2592000; SameSite=Strict`;
      }
      
      return () => {
        window.removeEventListener('online', () => setIsOnline(true));
        window.removeEventListener('offline', () => setIsOnline(false));
      };
    }
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
      scoutteam: "5895",
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
          sessionStorage.removeItem('auth_credentials');
          document.cookie = 'auth_credentials=; path=/; max-age=0; SameSite=Strict';
          setAuthCredentials(null);
          setShowSubmitDialog(false);
          setShowAuthDialog(true);
          setAuthError("Your session has expired. Please log in again.");
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
        scoutteam: "5895",
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
  const handleAuthSuccess = (credentials) => {
    setAuthCredentials(credentials);
    setShowAuthDialog(false);
    
    // If we have a redirect target, navigate to it after authentication
    if (authRedirectTarget) {
      // Clear URL parameters before redirecting
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.search = ''; // Remove all query parameters
        window.history.replaceState({}, '', url);
        
        // Short delay to ensure state is updated before redirect
        setTimeout(() => {
          window.location.href = authRedirectTarget;
        }, 50);
      } else {
        window.location.href = authRedirectTarget;
      }
      return;
    }
    
    // Otherwise, continue with showing the submit dialog if we were in that flow
    if (formData) {
      setShowSubmitDialog(true);
    }
  };

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

  return (
    <div className={`${styles.MainDiv} ${compactStyles.MainDiv}`}>
      <Toaster position="top-center" />
      
      {/* Suspense boundary for search params */}
      <Suspense fallback={null}>
        <AuthParameterHandler 
          onAuthRequired={handleAuthRequired}
          onRedirectTarget={handleRedirectTarget}
        />
      </Suspense>
      
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