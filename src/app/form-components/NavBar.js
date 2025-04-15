'use client';
import Link from "next/link";
import styles from "./NavBar.module.css";
import {useState, useEffect} from 'react';

export default function NavBar() {
    const [sudo, setSudo] = useState(false);
    const [authCredentials, setAuthCredentials] = useState(null);

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
        const linkProps = {
            href,
            // Custom headers or attributes for page transitions
            passHref: true
        };
        
        return <Link {...linkProps}>{children}</Link>;
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