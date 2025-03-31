import { Analytics } from '@vercel/analytics/next'
import { Inter } from 'next/font/google'
import './globals.css'

import NavBar from './form-components/NavBar.js'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  manifest: '/manifest.json',
  themeColor: '#000000',
  title: 'Team 5895 Analytics App',
  description: 'For scouting and analysis of the FIRST game!',

  appleWebApp: {
    capable: true,
    title: 'JÖRMUNSCOUTR',
    statusBarStyle: 'black'
  },

  viewport: {
    width: 'device-width',
    initialScale: 1,
    minimumScale: 1,
    maximumScale: 1,
    userScalable: 'no',
    viewportFit: 'cover'
  }

}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Teko&amp;display=swap" rel="stylesheet"></link>
        <link rel="apple-touch-icon" href="/icons/icon-192.png"></link>
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png"></link>
        <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512.png"></link>
      </head>
      <body className={inter.className}>
        <NavBar></NavBar>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
