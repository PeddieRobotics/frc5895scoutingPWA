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
    title: 'Jormunscoutr',
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
      </head>
      <body className={inter.className}>
        <NavBar></NavBar>
        {children}
      </body>
    </html>
  )
}
