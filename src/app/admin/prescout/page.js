'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminPrescoutRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/scout-leads/prescout/upload'); }, [router]);
  return <p style={{ padding: 40, textAlign: 'center', color: '#888', fontFamily: 'Montserrat, sans-serif' }}>Redirecting...</p>;
}
