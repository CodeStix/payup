import { PrismaClient } from "@prisma/client";
import NextAuth, { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import sanitizeHtml from "sanitize-html";

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

            const sanitizedUserName = user.name ? sanitizeHtml(user.name, { allowedTags: [], allowedAttributes: {} }) : null;
            const newUser = await prisma.user.upsert({
                where: {
                    email: user.email,
                },
                create: {
                    email: user.email,
                    userName: sanitizedUserName,
                    avatarUrl: user.image,
                    allowOtherUserManualTranser: true,
                    verifiedPaymentMethod: true,
                },
                update: {
                    email: user.email,
                    userName: sanitizedUserName,
                    avatarUrl: user.image,
                    lastLoginDate: new Date(),
                    verifiedPaymentMethod: true,
                },
            });

            await prisma.userToUser.upsert({
                where: {
                    requesterId_responderId: {
                        requesterId: newUser.id,
                        responderId: newUser.id,
                    },
                },
                create: {
                    requesterId: newUser.id,
                    responderId: newUser.id,
                },
                update: {},
            });

            return true;
        },
    },
};
