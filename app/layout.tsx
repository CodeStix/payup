import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import Head from "next/head";
config.autoAddCss = false;

const rubik = Rubik({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Pay Up!",
    description: "Automatically get paid and reminded about payments.",
    openGraph: {
        type: "website",
        title: "Pay Up!",
        description: "Automatically get paid and reminded about payments.",
        url: "https://payup.money",
        images: ["https://payup.money/orange_256.png"],
        siteName: "Pay Up!",
    },
    appleWebApp: { statusBarStyle: "default", title: "Pay Up!", capable: true, startupImage: "https://payup.money/orange_256.png" },
    keywords: ["pay", "reminder", "notification", "payment request", "payment", "request", "auto", "automatically", "balance", "friends"],
    applicationName: "Pay Up!",
    creator: "weboot",
    icons: [
        { rel: "icon", url: "https://payup.money/orange_256.png" },
        { rel: "apple-touch-icon", url: "https://payup.money/orange_256.png" },
    ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className={rubik.className}>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
