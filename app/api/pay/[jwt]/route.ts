import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { PrismaClient, User } from "@prisma/client";
import { JwtPayload, generatePaymentLink } from "@/notifications";

const prisma = new PrismaClient();

export async function GET(request: NextRequest, { params }: { params: { jwt: string } }): Promise<NextResponse> {
    let jwtPayLoad: JwtPayload;
    try {
        const jwtString = decodeURIComponent(params.jwt);
        jwtPayLoad = jwt.verify(jwtString, process.env.JWT_SECRET!) as JwtPayload;
    } catch (ex) {
        console.error("Could not parse jwt", ex);
        return NextResponse.json({}, { status: 400 });
    }

    console.log("jwt", jwtPayLoad);

    const balance = await prisma.relativeUserBalance.findUnique({
        where: {
            moneyHolderId_moneyReceiverId: {
                moneyHolderId: jwtPayLoad.h,
                moneyReceiverId: jwtPayLoad.r,
            },
        },
        select: {
            moneyHolder: {
                select: {
                    id: true,
                    email: true,
                    avatarUrl: true,
                    userName: true,
                },
            },
            moneyReceiver: {
                select: {
                    id: true,
                    email: true,
                    avatarUrl: true,
                    userName: true,
                    iban: true,
                    mollieApiKey: true,
                },
            },
            amount: true,
            lastRelatingPaymentRequest: {
                select: {
                    name: true,
                },
            },
        },
    });

    if (!balance) {
        return NextResponse.json(null, { status: 404 });
    }

    const otherWayBalance = await prisma.relativeUserBalance.findUnique({
        where: {
            moneyHolderId_moneyReceiverId: {
                moneyHolderId: jwtPayLoad.r,
                moneyReceiverId: jwtPayLoad.h,
            },
        },
        select: {
            amount: true,
            lastRelatingPaymentRequest: {
                select: {
                    name: true,
                },
            },
        },
    });

    return NextResponse.json({
        balance: {
            ...balance,
            moneyReceiver: {
                ...balance.moneyReceiver,
                mollieApiKey: undefined,
            },
        },
        otherWayBalance,
        amount: jwtPayLoad.o,
        paymentMethod: balance.moneyReceiver.mollieApiKey ? "mollie" : "iban",
    });
}
