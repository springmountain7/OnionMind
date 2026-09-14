import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./legal.css";

export const metadata: Metadata = {
  title: "OnionMind 洋葱",
  description: "把想不明白的事，一层层剥开。"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
