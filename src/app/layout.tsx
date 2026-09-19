/**
 * src/app/layout.tsx
 */
import type { Metadata } from 'next'
import type { ReactNode, ReactElement } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Jarvis',
  description: 'Local-first voice and text assistant',
  icons: { icon: '/favicon.ico' },
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="en" className="theme-matrix">
      <head>
        <style>{`
          :root{--bg:#0a0e0a;--dim:#111611;--primary:#00ff41;--secondary:#4a7c59;--text:#d4f5d4;--surface:#0f1a0f;--border:#1a2e1a}
          *{box-sizing:border-box;margin:0;padding:0}
          html,body{background:#0a0e0a;color:#d4f5d4;font-family:'JetBrains Mono',monospace;height:100%;overflow:hidden}
          #__next{min-height:100vh;background:var(--bg);color:var(--text)}
        `}</style>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ background: '#0a0e0a', color: '#d4f5d4', fontFamily: "'JetBrains Mono', monospace" }}>
        {children}
      </body>
    </html>
  )
}
