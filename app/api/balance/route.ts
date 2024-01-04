import { authOptions } from "@/authOptions";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({}, { status: 401 });
    }

    const body = (await request.json()) as { amount: number; moneyHolderId: number };

    if (typeof body.amount !== "number") {
        return NextResponse.json(null, { status: 400 });
    }

    await prisma.relativeUserBalance.updateMany({
        where: {
            moneyReceiver: {
                email: session.user.email,
            },
            moneyHolderId: body.moneyHolderId,
        },
        data: {
            lastPaymentDate: new Date(),
            amount: {
                increment: body.amount,
            },
        },
    });

    return NextResponse.json(null);
}
