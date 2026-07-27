import type { Metadata } from "next";
import "./globals.css";
import { getCurrentAdmin, isSuperAdmin } from '@/lib/auth';
import NavBar from '@/components/admin/NavBar';
import PublicHeader from '@/components/PublicHeader';
import WebsiteFooter from '@/components/WebsiteFooter';

export const metadata: Metadata = {
  title: "Encuerado Community Hub",
  description:
    "Community hub for Encuerado Weekend — browse events, sign up to volunteer, and connect with the community.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const admin = await getCurrentAdmin();
  const isSuper = admin ? isSuperAdmin(admin) : false;
  const isCheckIn = admin?.role === 'CHECK_IN';

  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-black text-white">
        {admin && <NavBar isSuperAdmin={isSuper} isCheckIn={isCheckIn} />}
        {!admin && <PublicHeader />}
        <div className="flex-1">{children}</div>
        {!admin && <WebsiteFooter />}
      </body>
    </html>
  );
}
