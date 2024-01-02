import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const rubik = Rubik({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Pay Up!",
    description: "Automatic payment reminding app using notifications",
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
