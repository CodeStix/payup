import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { balanceToMoneyHolderReceiver, moneyHolderReceiverToUsers } from "@/balance";
import { JwtPayload } from "@/notifications";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request: NextRequest, { params }: { params: { jwt: string } }): Promise<NextResponse> {
    let jwtPayLoad: JwtPayload;
    try {
        const jwtString = decodeURIComponent(params.jwt);
        jwtPayLoad = jwt.verify(jwtString, process.env.JWT_SECRET!) as JwtPayload;
    } catch (ex) {
        console.error("Could not parse jwt", ex);
        return NextResponse.json({}, { status: 400 });
    }

    const { firstUserId, secondUserId } = moneyHolderReceiverToUsers(jwtPayLoad.h, jwtPayLoad.r, jwtPayLoad.o);
    const balance = await prisma.relativeUserBalance.findUnique({
        where: {
            firstUserId_secondUserId: {
                firstUserId,
                secondUserId,
            },
        },
    });

    if (!balance) {
        return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const { amount, moneyHolderId, moneyReceiverId } = balanceToMoneyHolderReceiver(balance);

    if (amount < 0.01) {
        return NextResponse.json({ message: "Already even" }, { status: 400 });
    }
    if (moneyHolderId !== jwtPayLoad.h || moneyReceiverId !== jwtPayLoad.r) {
        return NextResponse.json({ message: "Other way around" }, { status: 400 });
    }

    if (firstUserId !== secondUserId)
        await prisma.relativeUserBalance.update({
            where: {
                firstUserId_secondUserId: {
                    firstUserId,
                    secondUserId,
                },
            },
            data: {
                paymentPageOpenedDate: new Date(),
            },
        });

    return NextResponse.json({ message: "Done" });
}
