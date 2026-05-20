import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { DesktopSidebar } from "@/components/sidebar-nav";
import { Topbar } from "@/components/topbar";
import { currentSession } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ResidentLedger",
  description: "Residents association accounting",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await currentSession().catch(() => null);

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        {session ? (
          <div className="flex min-h-screen">
            <DesktopSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar />
              <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
                <div className="mx-auto w-full max-w-6xl">{children}</div>
              </main>
            </div>
          </div>
        ) : (
          children
        )}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
