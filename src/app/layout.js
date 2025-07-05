import { Analytics } from '@vercel/analytics/next'
import { Inter } from 'next/font/google'
import './globals.css'

import NavBar from './form-components/NavBar.js'
import PWADetector from './form-components/PWADetector.js'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  manifest: '/manifest.json',
  title: 'JÖRMUNSCOUTR',
  description: 'Peddie Robotics\' Scouting & Analysis App',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180' },
      { url: '/apple-touch-icon-180x180.png', sizes: '180x180' },
    ],
  },

  appleWebApp: {
    capable: true,
    title: 'JÖRMUNSCOUTR',
    statusBarStyle: 'black-translucent',
    startupImage: [
      {
        url: '/icons/icon-512.png',
        media: '(device-width: 320px) and (device-height: 568px)'
      }
    ]
  },
  
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': 'JÖRMUNSCOUTR',
  }
}

export const viewport = {
  themeColor: '#153256',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  userScalable: 'yes',
  viewportFit: 'cover'
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Teko&amp;display=swap" rel="stylesheet"></link>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180x180.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/apple-touch-icon-192x192.png" />
        <script src="/auto-auth-cleanup.js"></script>
      </head>
      <body className={inter.className}>
        <PWADetector />
        <NavBar></NavBar>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
