import { JwtPayloadReminder } from "@/notifications";
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { moneyHolderReceiverToUsers } from "@/balance";

const prisma = new PrismaClient();

export async function GET(request: NextRequest, { params }: { params: { jwt: string } }): Promise<NextResponse> {
    let jwtPayLoad: JwtPayloadReminder;
    try {
        const jwtString = decodeURIComponent(params.jwt);
        jwtPayLoad = jwt.verify(jwtString, process.env.JWT_SECRET!) as JwtPayloadReminder;
    } catch (ex) {
        console.error("Could not parse jwt", ex);
        return NextResponse.json(null, { status: 400 });
    }

    const reminder = await prisma.paymentCheckReminder.findUnique({
        where: {
            id: jwtPayLoad.m,
        },
        select: {
            moneyHolder: {
                select: {
                    email: true,
                    userName: true,
                    iban: true,
                    avatarUrl: true,
                    id: true,
                },
            },
            moneyReceiver: {
                select: {
                    email: true,
                    userName: true,
                    iban: true,
                    avatarUrl: true,
                    id: true,
                },
            },
            confirmed: true,
            paidAmount: true,
            paidDate: true,
        },
    });

    return NextResponse.json(reminder);
}

// This route causes the reminder to reactivate
export async function POST(request: NextRequest, { params }: { params: { jwt: string } }): Promise<NextResponse> {
    let jwtPayLoad: JwtPayloadReminder;
    try {
        const jwtString = decodeURIComponent(params.jwt);
        jwtPayLoad = jwt.verify(jwtString, process.env.JWT_SECRET!) as JwtPayloadReminder;
    } catch (ex) {
        console.error("Could not parse jwt", ex);
        return NextResponse.json(null, { status: 400 });
    }

    const reminder = await prisma.paymentCheckReminder.findUnique({
        where: {
            id: jwtPayLoad.m,
        },
    });
    if (!reminder) {
        return NextResponse.json(null, { status: 404 });
    }
    if (reminder.confirmed !== null) {
        // Reminder already used
        return NextResponse.json({ message: "Already reopened payment" }, { status: 400 });
    }

    const body = (await request.json()) as { paid: boolean };

    const { firstUserId, secondUserId, amount } = moneyHolderReceiverToUsers(reminder.moneyHolderId, reminder.moneyReceiverId, reminder.paidAmount);
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
                    paymentPageOpenedDate: null,
                },
            });
    }

    await prisma.paymentCheckReminder.update({
        where: {
            id: jwtPayLoad.m,
        },
        data: {
            confirmed: body.paid === true,
        },
    });

    return NextResponse.json({});
}
