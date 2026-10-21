import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://metro-fare.vercel.app";
const TITLE = "Metro Fare India";
const DESCRIPTION =
  "Fare and fastest route for every operational Indian metro — Delhi, Bengaluru, Mumbai, Hyderabad, Chennai, Kolkata and 13 more — computed from each operator's own published fare slabs, so a trip that crosses two systems shows two fares.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · Metro Fare India" },
  description: DESCRIPTION,
  applicationName: TITLE,
  authors: [{ name: "Metro Fare India" }],
  creator: "Metro Fare India",
  publisher: "Metro Fare India",
  category: "travel",
  keywords: [
    "metro fare between two stations",
    "cross-operator metro fare calculator",
    "two operator metro trip fare india",
    "metro interchange journey fare",
    "cheapest metro route vs fastest metro route",
    "distance slab metro fare calculator",
    "station count based metro fare",
    "all india metro fare one app",
    "airport express vs regular metro fare delhi",
    "metro fare when changing lines",
    "noida aqua line to delhi metro fare",
    "rapid metro gurgaon to dmrc fare",
    "multi system metro journey cost india",
    "metro fare slab breakdown by operator",
    "offline metro fare chart india",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  icons: { icon: "/favicon.ico" },
  verification: { google: "9c9WJrB6k1_0JHlUx3V8JNS7B5t4OGt8asr9IeJZhkM" },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Applies the saved theme before paint, so dark users see no flash.
            The map primitive reads `.dark` / `.light` from <html> directly, so
            both are kept in sync — removing `.dark` alone would strand it. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;var r=document.documentElement.classList;r.toggle("dark",d);r.toggle("light",!d)}catch(e){}',
          }}
        />
        {children}
      </body>
    </html>
  );
}
