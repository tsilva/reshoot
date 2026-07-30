import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import "@/app/globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://reshoot.tsilva.eu"),
  title: "Reshoot — Every angle, one product",
  description:
    "Create a consistent studio set of product perspectives from one original image.",
  applicationName: "Reshoot",
  icons: {
    icon: [
      {
        url: "/brand/web-seo/favicon/favicon.ico",
        sizes: "16x16 32x32 48x48",
      },
      {
        url: "/brand/web-seo/favicon/favicon-32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
    apple: {
      url: "/brand/web-seo/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    },
  },
  openGraph: {
    title: "Reshoot — Every angle, one product",
    description:
      "Create a consistent studio set of product perspectives from one original image.",
    siteName: "Reshoot",
    type: "website",
    images: [
      {
        url: "/brand/web-seo/og-image-1200x630.png",
        width: 1200,
        height: 630,
        alt: "Reshoot product photography studio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Reshoot — Every angle, one product",
    description:
      "Create a consistent studio set of product perspectives from one original image.",
    images: ["/brand/web-seo/og-image-1200x630.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#faf9f6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
