"use client";
import { useState, useEffect } from 'react';
import { decode } from 'base-58';
import pako from 'pako';
import styles from './page.module.css';

export default function Scanner() {
  const [inputText, setInputText] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [results, setResults] = useState([]);
  const [authCredentials, setAuthCredentials] = useState(null);

  useEffect(() => {
    // Check for stored auth credentials
    if (typeof window !== 'undefined') {
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
      
      if (credentials) {
        setAuthCredentials(credentials);
      }
    }
  }, []);

  const processData = async (data) => {
    try {
      const entries = data.formType === 'tripleQualitative' 
        ? data.teams 
        : [data];

      // Extract the team name (scoutteam) from auth credentials
      let scoutTeam = "5895"; // Default value
      if (authCredentials) {
        try {
          const decodedCredentials = atob(authCredentials);
          const [teamName, _] = decodedCredentials.split(':');
          if (teamName) {
            scoutTeam = teamName;
          }
        } catch (error) {
          console.error("Error extracting scoutteam from auth credentials:", error);
        }
      }

      const uploadPromises = entries.map(async (entry) => {
        // Add the scoutteam to the entry data
        const enrichedEntry = { ...entry, scoutteam: scoutTeam };
        
        const response = await fetch('/api/add-match-data', {
          method: "POST",
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Basic ${authCredentials}`,
            ...(entry?.__meta?.gameId ? { 'X-Game-Id': String(entry.__meta.gameId) } : {})
          },
          body: JSON.stringify(enrichedEntry)
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Upload failed');
        }
        
        const responseData = await response.json();
        // Include the original team and match from the scan data
        return { 
          success: true, 
          data: {
            ...responseData,
            team: entry.team,
            match: entry.match
          } 
        };
      });

      const results = await Promise.all(uploadPromises);
      setResults(results);
      setUploadStatus(`Successfully uploaded ${entries.length} record(s)`);

    } catch (error) {
      console.error("Upload error:", error);
      setUploadStatus(`Error: ${error.message}`);
      throw error;
    }
  };

  const handleScan = async () => {
    if (!inputText.trim()) return;
    
    setUploadStatus("Processing...");
 
    try {
      // Decode Base58
      const sanitized = inputText.replace(/[^A-HJ-NP-Za-km-z1-9]/g, "");
      const decoded = decode(sanitized);
      
      // Decompress
      const decompressed = pako.ungzip(decoded, { to: 'string' });
      const parsedData = JSON.parse(decompressed);

      await processData(parsedData);
      setInputText("");

    } catch (error) {
      setUploadStatus("Invalid QR data format");
      console.error("Processing error:", error);
    }
  };

  
  return (
    <div className={styles.MainDiv}>
      <h2>QR Scanner</h2>

      <div className={styles.ScannerInput}>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Scan QR code here..."
          rows="3"
        />
        <button 
          onClick={handleScan}
          disabled={!inputText.trim()}
        >
          Process Scan
        </button>
      </div>

      <div className={styles.Status}>
        {uploadStatus}
      </div>

      {results.length > 0 && (
        <div className={styles.Results}>
          {results.map((result, index) => (
            <div key={index} className={styles.ResultCard}>
              <h3>Team {result.data?.team || 'N/A'}</h3>
              <p>Match: {result.data?.match || 'N/A'}</p>
              <p>Status: {result.success ? '✅ Success' : '❌ Failed'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
