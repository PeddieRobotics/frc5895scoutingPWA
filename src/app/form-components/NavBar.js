'use client';
import Link from "next/link";
import styles from "./NavBar.module.css";
import {useState, useEffect} from 'react';
import { useRouter } from 'next/navigation';

export default function NavBar() {
    const [sudo, setSudo] = useState(false);
    const [authCredentials, setAuthCredentials] = useState(null);
    const router = useRouter();

    useEffect(() => {
        if (typeof window !== "undefined") {
            // Check for sudo mode
            if (window.localStorage.getItem("sudo") == "true") {
                setSudo(true);
            }
            
            // Get auth credentials from localStorage or sessionStorage
            const storedCreds = sessionStorage.getItem('auth_credentials') || 
                                localStorage.getItem('auth_credentials');
            if (storedCreds) {
                setAuthCredentials(storedCreds);
            }
        }
    }, []);

    // Create a custom Link component that passes auth in headers
    const AuthLink = ({ href, children }) => {
        // Function to handle navigation with auth credentials
        const handleClick = (e) => {
            // Check if we have auth credentials
            const credentials = sessionStorage.getItem('auth_credentials') || 
                                localStorage.getItem('auth_credentials');
            
            if (!credentials) {
                e.preventDefault();
                // No credentials, redirect to home with auth params
                window.location.href = `/?authRequired=true&redirect=${href}&t=${Date.now().toString()}`;
                return;
            }
            
            // If we already have credentials, perform a quick client-side validation
            const validateToken = async () => {
                try {
                    // Add client-validating header to prevent middleware validation loop
                    const timestamp = new Date().getTime();
                    const response = await fetch(`/api/auth/validate?_t=${timestamp}`, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Basic ${credentials}`,
                            'Cache-Control': 'no-cache, no-store, must-revalidate',
                            'Pragma': 'no-cache',
                            'x-client-validating': 'true'
                        },
                        cache: 'no-store'
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok && data.authenticated) {
                        // Credentials are valid, proceed with full page navigation
                        window.location.href = href;
                    } else {
                        // Credentials invalid, redirect to home with auth params
                        window.location.href = `/?authRequired=true&redirect=${href}&t=${Date.now().toString()}`;
                    }
                } catch (error) {
                    console.error("Auth validation error:", error);
                    // On error, redirect to home with auth params
                    window.location.href = `/?authRequired=true&redirect=${href}&t=${Date.now().toString()}`;
                }
            };
            
            e.preventDefault();
            validateToken();
        };
        
        return <Link href={href} onClick={handleClick}>{children}</Link>;
    };

    return <nav className={styles.navbar}>
        <img className={styles.logo} src="https://static.wixstatic.com/media/01a1eb_8e7e35f6173149238e59205a31892fc9~mv2.png"></img>
        <div className={styles.pages}>
            <AuthLink href="/">Scouting Form</AuthLink>
            <AuthLink href="/scanner">Scanner</AuthLink>
            <AuthLink href="/team-view">Team View</AuthLink>
            <AuthLink href="/match-view">Match View</AuthLink>
            <AuthLink href="/compare">Compare</AuthLink>
            <AuthLink href="/picklist">Picklist</AuthLink>
            {sudo && 
                <AuthLink href='/sudo'>Sudo</AuthLink>
            }
        </div>
    </nav>
}