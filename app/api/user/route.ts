import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/authOptions";
import { PrismaClient } from "@prisma/client";
import iban from "iban";

const prisma = new PrismaClient();

export async function GET(request: NextRequest): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({}, { status: 401 });
    }
    const user = await prisma.user.findUniqueOrThrow({
        where: {
            email: session.user.email,
        },
        select: {
            id: true,
            userName: true,
            email: true,
            mollieApiKey: true,
            avatarUrl: true,
            iban: true,
            registerDate: true,
            allowOtherUserManualTranser: true,
        },
    });

    return NextResponse.json(user);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({}, { status: 401 });
    }

    const body = (await request.json()) as { iban?: string; mollieApiKey?: string; allowOtherUserManualTranser?: boolean };

    if (typeof body.iban !== "string" || body.iban) {
        if (typeof body.iban !== "string" || !iban.isValid(body.iban)) {
            return NextResponse.json({ iban: "Invalid IBAN" }, { status: 400 });
        }
    }

    const newUser = await prisma.user.update({
        where: {
            email: session.user.email,
        },
        data: {
            mollieApiKey: body.mollieApiKey || undefined,
            iban: body.iban || undefined,
            allowOtherUserManualTranser: typeof body.allowOtherUserManualTranser === "boolean" ? body.allowOtherUserManualTranser : undefined,
        },
    });

    return NextResponse.json(newUser);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({}, { status: 401 });
    }

    // TODO more validation
    const body = await request.json();
    if (!body.email) {
        return NextResponse.json({}, { status: 400 });
    }

    const newUser = await prisma.user.create({
        data: {
            email: body.email,
            userName: body.userName || undefined,
            responders: {
                create: {
                    requester: {
                        connect: {
                            email: session.user.email,
                        },
                    },
                },
            },
        },
    });

    return NextResponse.json({
        user: newUser,
    });
}
