import { authOptions } from "@/authOptions";
import { moneyHolderReceiverToUsers } from "@/balance";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({}, { status: 401 });
    }

    const balances = await prisma.relativeUserBalance.findMany({
        where: {
            OR: [{ firstUser: { email: session.user.email } }, { secondUser: { email: session.user.email } }],
        },
        select: {
            amount: true,
            lastRelatingPaymentRequest: {
                select: {
                    id: true,
                    name: true,
                },
            },
            firstUser: {
                select: {
                    id: true,
                    userName: true,
                    email: true,
                    avatarUrl: true,
                },
            },
            secondUser: {
                select: {
                    id: true,
                    userName: true,
                    email: true,
                    avatarUrl: true,
                },
            },
        },
    });

    return NextResponse.json(balances);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({}, { status: 401 });
    }

    const body = (await request.json()) as { amount: number; moneyHolderId: number; moneyReceiverId: number };

    if (typeof body.amount !== "number" || typeof body.moneyHolderId !== "number" || typeof body.moneyReceiverId !== "number") {
        return NextResponse.json(null, { status: 400 });
    }
    if (body.amount < 0.01) {
        return NextResponse.json(null);
    }

    try {
        const { firstUserId, secondUserId, amount, moneyReceiverKey } = moneyHolderReceiverToUsers(
            body.moneyHolderId,
            body.moneyReceiverId,
            body.amount
        );

        if (firstUserId !== secondUserId)
            await prisma.relativeUserBalance.update({
                where: {
                    firstUserId_secondUserId: {
                        firstUserId: firstUserId,
                        secondUserId: secondUserId,
                    },
                    [moneyReceiverKey]: {
                        OR: [{ allowOtherUserManualTranser: true }, { email: session.user.email }],
                    },
                },
                data: {
                    lastPaymentDate: new Date(),
                    lastUpdatedDate: new Date(),
                    paymentPageOpenedDate: null,
                    amount: {
                        increment: amount,
                    },
                },
            });
    } catch (ex) {
        console.error("Could not add manual balance", ex);
        return NextResponse.json({}, { status: 400 });
    }

    return NextResponse.json(null);
}
