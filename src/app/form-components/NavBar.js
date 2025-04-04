'use client';
import Link from "next/link";
import styles from "./NavBar.module.css";
import {useState, useEffect} from 'react';

export default function NavBar() {
    const [sudo, setSudo] = useState(false);

    useEffect(() => {
        if (typeof window !== "undefined" && window.localStorage.getItem("sudo") == "true") {
            setSudo(true);
        }
    }, [])

    return <nav className={styles.navbar}>
        <img className={styles.logo} src="https://static.wixstatic.com/media/01a1eb_8e7e35f6173149238e59205a31892fc9~mv2.png"></img>
        <div className={styles.pages}>
            <Link href="/">Scouting Form</Link>
            <Link href="/scanner">Scanner</Link>
            <Link href="/team-view">Team View</Link>
            <Link href="/match-view">Match View</Link>
            <Link href="/compare">Compare</Link>
            <Link href="/picklist">Picklist</Link>
            {sudo && 
                <Link href='/sudo'>Sudo</Link>
            }
        </div>
    </nav>
}