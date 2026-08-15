import type { Metadata, Viewport } from 'next';
import './globals.css';
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 5, userScalable: true };
export const metadata:Metadata={title:'MediRank — More patient trust, one review at a time',description:'MediRank By Vyapar Wallah — AI-powered Google review collection for doctors and clinics.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
