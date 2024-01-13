import { JwtPayload } from "@/notifications";
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { balanceToMoneyHolderReceiver, moneyHolderReceiverToUsers } from "@/balance";

const prisma = new PrismaClient();

export async function GET(request: NextRequest, { params }: { params: { jwt: string } }): Promise<NextResponse> {
    let jwtPayLoad: JwtPayload;
    try {
        const jwtString = decodeURIComponent(params.jwt);
        jwtPayLoad = jwt.verify(jwtString, process.env.JWT_SECRET!) as JwtPayload;
    } catch (ex) {
        console.error("Could not parse jwt", ex);
        return NextResponse.json(null, { status: 400 });
    }

    if (jwtPayLoad.m !== true || typeof jwtPayLoad.c !== "number") {
        return NextResponse.json(null, { status: 404 });
    }
    const jwtDate = new Date(jwtPayLoad.c);

    const { firstUserId, secondUserId } = moneyHolderReceiverToUsers(jwtPayLoad.h, jwtPayLoad.r, jwtPayLoad.o);
    const balance = await prisma.relativeUserBalance.findUnique({
        where: {
            firstUserId_secondUserId: {
                firstUserId,
                secondUserId,
            },
        },
        select: {
            firstUser: {
                select: {
                    email: true,
                    userName: true,
                    iban: true,
                    avatarUrl: true,
                    id: true,
                },
            },
            secondUser: {
                select: {
                    email: true,
                    userName: true,
                    iban: true,
                    avatarUrl: true,
                    id: true,
                },
            },
            amount: true,
            lastPaymentDate: true,
            paymentPageOpenedDate: true,
            lastReminderOpenedDate: true,
        },
    });

    if (!balance) {
        return NextResponse.json(null, { status: 404 });
    }

    const { amount, moneyHolder, moneyReceiver } = balanceToMoneyHolderReceiver(balance);
    return NextResponse.json({
        ...balance,
        moneyReceiver,
        moneyHolder,
        amount,
        invalid: balance.lastReminderOpenedDate !== null && jwtDate.getTime() <= balance.lastReminderOpenedDate.getTime(),
    });
}

// This route causes the reminder to reactivate
export async function POST(request: NextRequest, { params }: { params: { jwt: string } }): Promise<NextResponse> {
    let jwtPayLoad: JwtPayload;
    try {
        const jwtString = decodeURIComponent(params.jwt);
        jwtPayLoad = jwt.verify(jwtString, process.env.JWT_SECRET!) as JwtPayload;
    } catch (ex) {
        console.error("Could not parse jwt", ex);
        return NextResponse.json(null, { status: 400 });
    }

    if (jwtPayLoad.m !== true || typeof jwtPayLoad.c !== "number") {
        return NextResponse.json(null, { status: 404 });
    }
    const jwtDate = new Date(jwtPayLoad.c);

    const { firstUserId, secondUserId, amount } = moneyHolderReceiverToUsers(jwtPayLoad.h, jwtPayLoad.r, jwtPayLoad.o);
    const balance = await prisma.relativeUserBalance.findUnique({
        where: {
            firstUserId_secondUserId: {
                firstUserId,
                secondUserId,
            },
        },
    });
    if (!balance) {
        return NextResponse.json(null, { status: 404 });
    }
    if (balance.lastReminderOpenedDate && jwtDate.getTime() <= balance.lastReminderOpenedDate.getTime()) {
        // Link already used
        return NextResponse.json({ message: "Invalid link" }, { status: 400 });
    }

    if (Math.abs(balance.amount) < 0.01) {
        return NextResponse.json({ message: "Already even" });
    }

    const body = (await request.json()) as { paid: boolean };
    if (body.paid === true) {
        // Register money as paid
        if (firstUserId !== secondUserId)
            await prisma.relativeUserBalance.update({
                where: {
                    firstUserId_secondUserId: {
                        firstUserId,
                        secondUserId,
                    },
                },
                data: {
                    amount: {
                        increment: amount,
                    },
                    lastPaymentDate: new Date(),
                    lastUpdatedDate: new Date(),
                    lastReminderOpenedDate: new Date(),
                    paymentPageOpenedDate: null,
                },
            });
    } else {
        if (firstUserId !== secondUserId)
            await prisma.relativeUserBalance.update({
                where: {
                    firstUserId_secondUserId: {
                        firstUserId,
                        secondUserId,
                    },
                },
                data: {
                    lastReminderOpenedDate: new Date(),
                    paymentPageOpenedDate: null,
                },
            });
    }

    return NextResponse.json({});
}
