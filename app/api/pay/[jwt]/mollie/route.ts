import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { getClientForUser } from "@/mollie";
import { JwtPayload } from "@/notifications";
import { balanceToMoneyHolderReceiver, moneyHolderReceiverToUsers } from "@/balance";

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
        include: {
            firstUser: true,
            secondUser: true,
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

    const { amount, moneyHolder, moneyReceiver } = balanceToMoneyHolderReceiver(balance);
    if (moneyHolder.id !== jwtPayLoad.h || moneyReceiver.id !== jwtPayLoad.r) {
        return NextResponse.json({ message: "Other way around" }, { status: 400 });
    }
    if (amount < 0.01) {
        return NextResponse.json({ message: "Already even" }, { status: 400 });
    }

    const mollieClient = getClientForUser(moneyReceiver);
    if (!mollieClient) {
        console.error("Could not get mollie client for", moneyReceiver);
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
                value: amount.toFixed(2),
            },
            description: balance.lastRelatingPaymentRequest?.name ?? "No reason specified",
            redirectUrl: `${process.env.SERVER_URL}/api/pay/${params.jwt}/mollie/callback`,
        });
    } catch (ex) {
        console.error(ex);
        return NextResponse.json({ message: "Could not create mollie payment" }, { status: 500 });
    } finally {
        console.log("Mollie payment created", molliePayment?.id);
        if (firstUserId !== secondUserId)
            await prisma.relativeUserBalance.update({
                where: {
                    firstUserId_secondUserId: {
                        firstUserId,
                        secondUserId,
                    },
                },
                data: {
                    currentMolliePaymentId: molliePayment?.id || null,
                },
            });
    }

    return NextResponse.json({ checkoutUrl: molliePayment.getCheckoutUrl() });
}
