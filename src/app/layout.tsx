import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FreshStock — Inventory, in good shape',
  description: 'Real-time inventory and perishables management for your team.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
