import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description =
  "SumUSD is an over-collateralized aggregated USD stablecoin backed by a basket of whitelisted, GENIUS-Act-compliant stablecoins.";

export const metadata: Metadata = {
  metadataBase: new URL("https://sumusd.com"),
  title: "SumUSD — Aggregated USD Stablecoin",
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "https://sumusd.com",
    siteName: "SumUSD",
    title: "SumUSD — Aggregated USD Stablecoin",
    description,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "SumUSD — Aggregated USD Stablecoin" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SumUSD — Aggregated USD Stablecoin",
    description,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
