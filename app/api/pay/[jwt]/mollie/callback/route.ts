import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { getClientForUser } from "@/mollie";
import { JwtPayload } from "@/notifications";
import { PaymentStatus } from "@mollie/api-client";

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

    const balance = await prisma.relativeUserBalance.findUnique({
        where: {
            moneyHolderId_moneyReceiverId: {
                moneyHolderId: jwtPayLoad.h,
                moneyReceiverId: jwtPayLoad.r,
            },
        },
        include: {
            moneyReceiver: true,
            lastRelatingPaymentRequest: {
                select: {
                    name: true,
                },
            },
        },
    });

    if (!balance) {
        return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    if (!balance.currentMolliePaymentId) {
        return NextResponse.json({ message: "No payment active" }, { status: 400 });
    }

    const mollieClient = getClientForUser(balance.moneyReceiver);
    if (!mollieClient) {
        console.error("Could not get mollie client for", balance.moneyReceiver);
        return NextResponse.json({ message: "Cannot create mollie client" }, { status: 400 });
    }

    let molliePayment;
    try {
        molliePayment = await mollieClient.payments.get(balance.currentMolliePaymentId);
    } catch (ex) {
        console.error(ex);
        return NextResponse.json({ message: "Could not find mollie payment" }, { status: 500 });
    }

    if (molliePayment.status === PaymentStatus.paid) {
        await prisma.relativeUserBalance.update({
            where: {
                moneyHolderId_moneyReceiverId: {
                    moneyHolderId: jwtPayLoad.h,
                    moneyReceiverId: jwtPayLoad.r,
                },
            },
            data: {
                amount: {
                    set: 0,
                },
                lastPaymentDate: new Date(),
                currentMolliePaymentId: null,
            },
        });

        try {
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
        } catch {}
    }

    return NextResponse.redirect(`${process.env.SERVER_URL}/pay/${params.jwt}?status=${encodeURIComponent(molliePayment.status)}`);
}
