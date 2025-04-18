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
  },

  appleWebApp: {
    capable: true,
    title: 'JÖRMUNSCOUTR',
    statusBarStyle: 'black',
    startupImage: [
      {
        url: '/icons/icon-512.png',
        media: '(device-width: 320px) and (device-height: 568px)'
      }
    ]
  }
}

export const viewport = {
  themeColor: '#000000',
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
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="icon" href="/favicon.ico" type="image/x-icon" />
        <link rel="icon" href="/favicon.ico" type="image/png" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png"></link>
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png"></link>
        <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512.png"></link>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="JÖRMUNSCOUTR" />
        <meta name="mobile-web-app-capable" content="yes" />
        
        <script src="/fix-auth.js"></script>
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
