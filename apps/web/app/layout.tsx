import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";

import "@workspace/ui/globals.css";
import { QueryProvider } from "@/components/query-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@workspace/ui/components/sonner";
import { cn } from "@workspace/ui/lib/utils";

const body = Geist({ subsets: ["latin"], variable: "--font-sans" });

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
});

const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "PokéDex Manager",
  description: "Cataloga tu colección de cartas y descubre qué te falta",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        body.variable,
        display.variable,
        mono.variable,
        "font-sans",
      )}
    >
      <body className="bg-background text-foreground min-h-svh">
        <ThemeProvider forcedTheme="dark">
          <QueryProvider>{children}</QueryProvider>
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
