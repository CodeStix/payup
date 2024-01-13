import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, User } from "@prisma/client";
import { JwtPayload, generatePaymentLink } from "@/notifications";
import { authOptions } from "@/authOptions";
import { getServerSession } from "next-auth";
import { balanceToMoneyHolderReceiver, moneyHolderReceiverToUsers } from "@/balance";

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
    if (typeof body.moneyHolderId !== "number" || typeof body.moneyReceiverId !== "number") {
        return NextResponse.json({ message: "Invalid body" }, { status: 400 });
    }

    const { firstUserId, secondUserId } = moneyHolderReceiverToUsers(body.moneyHolderId, body.moneyReceiverId);
    const balance = await prisma.relativeUserBalance.findUnique({
        where: {
            firstUserId_secondUserId: { firstUserId, secondUserId },
        },
    });

    if (!balance) {
        return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const { moneyHolderId, moneyReceiverId, amount } = balanceToMoneyHolderReceiver(balance);
    if (amount < 0.01) {
        return NextResponse.json({ message: "Already even" }, { status: 400 });
    }
    if (body.moneyHolderId !== moneyHolderId || body.moneyReceiverId !== moneyReceiverId) {
        return NextResponse.json({ message: "Other way around" }, { status: 400 });
    }

    const paymentLink = await generatePaymentLink(moneyHolderId, moneyReceiverId, amount);
    return NextResponse.json({
        paymentLink: paymentLink,
    });
}
