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

    const body = (await request.json()) as { amount: number; moneyHolderId: number; moneyReceiverId: number };

    if (typeof body.amount !== "number" || typeof body.moneyHolderId !== "number" || typeof body.moneyReceiverId !== "number") {
        return NextResponse.json(null, { status: 400 });
    }
    if (Math.abs(body.amount) < 0.01) {
        return NextResponse.json(null);
    }

    try {
        await prisma.relativeUserBalance.update({
            where: {
                moneyHolderId_moneyReceiverId: {
                    moneyHolderId: body.amount > 0 ? body.moneyHolderId : body.moneyReceiverId,
                    moneyReceiverId: body.amount > 0 ? body.moneyReceiverId : body.moneyHolderId,
                },
                moneyHolder: {
                    OR: [{ allowOtherUserManualTranser: true }, { email: session.user.email }],
                },
            },
            data: {
                lastPaymentDate: new Date(),
                amount: {
                    increment: Math.abs(body.amount),
                },
            },
        });
    } catch (ex) {
        console.error("Could not add manual balance", ex);
        return NextResponse.json({}, { status: 400 });
    }

    return NextResponse.json(null);
}
