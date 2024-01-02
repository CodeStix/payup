import { PrismaClient } from "@prisma/client";
import NextAuth, { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const prisma = new PrismaClient();

export const authOptions: AuthOptions = {
    secret: process.env.NEXTAUTH_SECRET,
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
                params: {
                    prompt: "consent",
                    access_type: "offline",
                    response_type: "code",
                },
            },
        }),
    ],
    callbacks: {
        async signIn(params) {
            const user = params.user;
            if (!user.email) {
                return false;
            }

            await prisma.user.upsert({
                where: {
                    email: user.email,
                },
                create: {
                    email: user.email,
                    userName: user.name,
                    avatarUrl: user.image,
                },
                update: {
                    email: user.email,
                    userName: user.name,
                    avatarUrl: user.image,
                    lastLoginDate: new Date(),
                },
            });

            return true;
        },
    },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };