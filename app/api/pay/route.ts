import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, User } from "@prisma/client";
import { JwtPayload, generatePaymentLink } from "@/notifications";
import { authOptions } from "@/authOptions";
import { getServerSession } from "next-auth";

const prisma = new PrismaClient();

export async function POST(request: NextRequest, { params }: { params: { jwt: string } }): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({}, { status: 401 });
    }

    const body = (await request.json()) as {
        moneyHolderId: number;
        moneyReceiverId: number;
    };

    const balance = await prisma.relativeUserBalance.findUnique({
        where: {
            moneyHolderId_moneyReceiverId: {
                moneyHolderId: body.moneyHolderId,
                moneyReceiverId: body.moneyReceiverId,
            },
        },
    });

    if (!balance) {
        return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const otherWayBalance = await prisma.relativeUserBalance.findUnique({
        where: {
            moneyHolderId_moneyReceiverId: {
                moneyHolderId: body.moneyReceiverId,
                moneyReceiverId: body.moneyHolderId,
            },
        },
    });

    const owsAmount = otherWayBalance ? balance.amount - otherWayBalance.amount : balance.amount;

    if (owsAmount <= 0) {
        return NextResponse.json({ message: "Doesn't owe" }, { status: 400 });
    }

    const paymentLink = await generatePaymentLink(body.moneyHolderId, body.moneyReceiverId, owsAmount);

    return NextResponse.json({
        paymentLink: paymentLink,
    });
}
