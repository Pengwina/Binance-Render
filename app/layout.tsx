import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Options Lab | Cross-exchange dashboard",
  description: "Live BTC and ETH options, volatility and estimated gamma exposure across Deribit, OKX, Bybit and Binance.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
