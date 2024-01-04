import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { getClientForUser } from "@/mollie";
import { JwtPayload } from "@/notifications";

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

    const mollieClient = getClientForUser(balance.moneyReceiver);
    if (!mollieClient) {
        console.error("Could not get mollie client for", balance.moneyReceiver);
        return NextResponse.json({ message: "Cannot create mollie client" }, { status: 400 });
    }

    if (balance.currentMolliePaymentId) {
        try {
            console.log("Cancel previous mollie payment", balance.currentMolliePaymentId);
            await mollieClient.payments.cancel(balance.currentMolliePaymentId);
        } catch (ex) {
            console.error("Could not cancel previous mollie payment", ex);
        }
    }

    let molliePayment = null;
    try {
        molliePayment = await mollieClient.payments.create({
            amount: {
                currency: "EUR",
                value: ows.toFixed(2),
            },
            description: balance.lastRelatingPaymentRequest?.name ?? "No reason specified",
            redirectUrl: `${process.env.SERVER_URL}/api/pay/${params.jwt}/mollie/callback`,
        });
    } catch (ex) {
        console.error(ex);
        return NextResponse.json({ message: "Could not create mollie payment" }, { status: 500 });
    } finally {
        console.log("Mollie payment created", molliePayment?.id);
        await prisma.relativeUserBalance.update({
            where: {
                moneyHolderId_moneyReceiverId: {
                    moneyHolderId: jwtPayLoad.h,
                    moneyReceiverId: jwtPayLoad.r,
                },
            },
            data: {
                currentMolliePaymentId: molliePayment?.id || null,
            },
        });
    }

    return NextResponse.json({ checkoutUrl: molliePayment.getCheckoutUrl() });
}
