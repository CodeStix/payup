import { JwtPayloadReminder } from "@/notifications";
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

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
            opened: true,
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
    if (reminder.opened) {
        // Reminder already used
        return NextResponse.json({ message: "Already reopened payment" }, { status: 400 });
    }

    const body = (await request.json()) as { paid: boolean };

    if (body.paid === false) {
        // Re-create money difference
        await prisma.relativeUserBalance.update({
            where: {
                moneyHolderId_moneyReceiverId: {
                    moneyHolderId: reminder.moneyHolderId,
                    moneyReceiverId: reminder.moneyReceiverId,
                },
            },
            data: {
                amount: {
                    increment: reminder.paidAmount,
                },
            },
        });
    }

    await prisma.paymentCheckReminder.update({
        where: {
            id: jwtPayLoad.m,
        },
        data: {
            opened: true,
        },
    });

    return NextResponse.json({});
}
