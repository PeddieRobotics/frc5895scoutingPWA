'use client';
import Link from "next/link";
import styles from "./NavBar.module.css";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const SITE_PAGES = [
    { href: '/', label: 'Scouting Form' },
    { href: '/scanner', label: 'Scanner' },
    { href: '/scout-leads', label: 'Scout Leads' },
    { href: '/team-view', label: 'Team View' },
    { href: '/match-view', label: 'Match View' },
    { href: '/compare', label: 'Compare' },
    { href: '/picklist', label: 'Picklist' },
    { href: '/betting', label: 'Betting', configFlag: 'enableBetting' },
    { href: '/admin', label: 'Admin', sudoOnly: true },
    { href: '/admin/games', label: 'Game Config', sudoOnly: true },
    { href: '/sudo', label: 'Sudo', sudoOnly: true },
];

export default function NavBar() {
    const [sudo, setSudo] = useState(false);
    const [authCredentials, setAuthCredentials] = useState(null);
    const [siteMapOpen, setSiteMapOpen] = useState(false);
    const [activeConfig, setActiveConfig] = useState(null);
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

            // Fetch active game config for feature flags
            fetch('/api/admin/games/active', { cache: 'no-store' })
                .then(r => r.ok ? r.json() : null)
                .then(data => { if (data?.config) setActiveConfig(data.config); })
                .catch(() => {});
        }
    }, []);

    // Create a custom Link component that passes auth in headers
    const AuthLink = ({ href, children, onClose }) => {
        // Function to handle navigation with auth credentials
        const handleClick = (e) => {
            if (onClose) onClose();
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

    const visiblePages = SITE_PAGES.filter(p => {
        if (p.sudoOnly && !sudo) return false;
        if (p.configFlag && !activeConfig?.[p.configFlag]) return false;
        return true;
    });

    return <>
        <nav className={styles.navbar}>
            <img
                className={styles.logo}
                src="/transLogo.png"
                onClick={() => setSiteMapOpen(o => !o)}
                style={{ cursor: 'pointer' }}
            />
            <div className={styles.pages}>
                <AuthLink href="/">Scouting Form</AuthLink>
                <AuthLink href="/scanner">Scanner</AuthLink>
                <AuthLink href="/scout-leads">Scout Leads</AuthLink>
                <AuthLink href="/team-view">Team View</AuthLink>
                <AuthLink href="/match-view">Match View</AuthLink>
                <AuthLink href="/compare">Compare</AuthLink>
                <AuthLink href="/picklist">Picklist</AuthLink>
            </div>
        </nav>

        {siteMapOpen && <>
            <div className={styles.siteMapOverlay} onClick={() => setSiteMapOpen(false)} />
            <div className={styles.siteMap}>
                <div className={styles.siteMapHeader}>Site Map</div>
                <ul className={styles.siteMapTree}>
                    {visiblePages.map(p => (
                        <li key={p.href}>
                            <AuthLink href={p.href} onClose={() => setSiteMapOpen(false)}>
                                {p.label}
                            </AuthLink>
                        </li>
                    ))}
                </ul>
            </div>
        </>}
    </>
}
