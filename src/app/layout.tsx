import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: { default: 'MoFloKnowledge', template: '%s · MoFloKnowledge' }, description: 'Company knowledge, grounded in evidence.' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
