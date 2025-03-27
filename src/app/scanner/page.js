"use client";
import { useState } from 'react';
import { decode } from 'base-58';
import pako from 'pako';
import styles from './page.module.css';

export default function Scanner() {
  const [inputText, setInputText] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [results, setResults] = useState([]);

  const processData = async (data) => {
    try {
      const entries = data.formType === 'tripleQualitative' 
        ? data.teams 
        : [data];

      const uploadPromises = entries.map(async (entry) => {
        const response = await fetch('/api/add-match-data', {
          method: "POST",
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry)
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Upload failed');
        }
        
        const responseData = await response.json();
        return { success: true, data: responseData };
      });

      const results = await Promise.all(uploadPromises);
      setResults(results);
      setUploadStatus(`Successfully uploaded ${entries.length} records`);

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
              <h3>Team {result.team || 'N/A'}</h3>
              <p>Match: {result.match || 'N/A'}</p>
              {/* Fixed status display */}
              <p>Status: {result.success ? '✅ Success' : '❌ Failed'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}