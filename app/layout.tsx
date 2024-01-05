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
    description: "Automatic payment reminding app using notifications",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <meta name="theme-color" content="#dd6b20" />
                <meta name="description" content="Automatically get paid and reminded about payments." />
                <link rel="apple-touch-icon" href="/orange_96.png" />
                <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
                <meta property="og:title" content="Pay Up!" />
                <meta property="og:description" content="Automatically get paid and reminded about payments." />
                <meta property="og:url" content="https://payup.weboot.nl/" />
                {/* <meta property="og:image" content="https://payup.weboot.nl/banner.jpg" /> */}
                <title>Pay Up!</title>
            </head>
            <body className={rubik.className}>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
