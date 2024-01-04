import { JwtPayload } from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
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

    const balance = await prisma.relativeUserBalance.findUnique({
        where: {
            moneyHolderId_moneyReceiverId: {
                moneyHolderId: jwtPayLoad.h,
                moneyReceiverId: jwtPayLoad.r,
            },
        },
    });

    if (!balance) {
        return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const otherWayBalance = await prisma.relativeUserBalance.findUnique({
        where: {
            moneyHolderId_moneyReceiverId: {
                moneyHolderId: jwtPayLoad.r,
                moneyReceiverId: jwtPayLoad.h,
            },
        },
    });

    const ows = otherWayBalance ? balance.amount - otherWayBalance.amount : balance.amount;

    if (ows <= 0) {
        return NextResponse.json({ message: ows === 0 ? "Already paid" : "The other user ows you money" }, { status: 400 });
    }

    await prisma.relativeUserBalance.update({
        where: {
            moneyHolderId_moneyReceiverId: {
                moneyHolderId: jwtPayLoad.h,
                moneyReceiverId: jwtPayLoad.r,
            },
        },
        data: {
            lastPaymentDate: new Date(),
            amount: {
                set: 0,
            },
        },
    });

    if (otherWayBalance) {
        await prisma.relativeUserBalance.update({
            where: {
                moneyHolderId_moneyReceiverId: {
                    moneyHolderId: jwtPayLoad.r,
                    moneyReceiverId: jwtPayLoad.h,
                },
            },
            data: {
                amount: {
                    set: 0,
                },
            },
        });
    }

    return NextResponse.json({ message: "Done" });
}
