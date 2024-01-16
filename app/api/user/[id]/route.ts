import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/authOptions";
import { PrismaClient } from "@prisma/client";
import iban from "iban";

const prisma = new PrismaClient();

export async function GET(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json(undefined, { status: 401 });
    }

    const userId = parseInt(params.id);
    if (isNaN(userId)) {
        return NextResponse.json(undefined, { status: 400 });
    }

    const user = await prisma.user.findUnique({
        where: {
            id: userId,
        },
        select: {
            email: true,
            avatarUrl: true,
            id: true,
            userName: true,
            preferredPaymentMethod: true,
        },
    });

    return NextResponse.json(user, { status: user ? 200 : 404 });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json(undefined, { status: 401 });
    }

    const userId = parseInt(params.id);
    if (isNaN(userId)) {
        return NextResponse.json(undefined, { status: 400 });
    }
    const body = (await request.json()) as { iban?: string };
    if (typeof body.iban !== "undefined") {
        if (typeof body.iban !== "string" || !iban.isValid(body.iban)) {
            return NextResponse.json({ iban: "Invalid IBAN" }, { status: 400 });
        }
    }

    const user = await prisma.user.findUnique({
        where: {
            id: userId,
        },
        select: {
            iban: true,
            mollieApiKey: true,
            preferredPaymentMethod: true,
            verifiedPaymentMethod: true,
        },
    });
    if (!user) {
        return NextResponse.json(undefined, { status: 404 });
    }
    if (user.verifiedPaymentMethod && (user.preferredPaymentMethod === "IBAN" ? user.iban : user.mollieApiKey)) {
        return NextResponse.json(undefined, { status: 403 });
    }

    const updatedUser = await prisma.user.update({
        where: {
            id: userId,
        },
        data: {
            verifiedPaymentMethod: false,
            iban: body.iban,
        },
        select: {
            id: true,
            userName: true,
            email: true,
            avatarUrl: true,
        },
    });

    return NextResponse.json(updatedUser, { status: user ? 200 : 404 });
}
