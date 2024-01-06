import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { getClientForUser } from "@/mollie";
import { JwtPayload } from "@/notifications";
import { PaymentStatus } from "@mollie/api-client";
import { balanceToMoneyHolderReceiver, moneyHolderReceiverToUsers } from "@/balance";

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

    const { firstUserId, secondUserId } = moneyHolderReceiverToUsers(jwtPayLoad.h, jwtPayLoad.r, jwtPayLoad.o);
    const balance = await prisma.relativeUserBalance.findUnique({
        where: {
            firstUserId_secondUserId: { firstUserId, secondUserId },
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
    if (!balance.currentMolliePaymentId) {
        return NextResponse.json({ message: "No payment active" }, { status: 400 });
    }

    const { moneyReceiver, moneyHolder } = balanceToMoneyHolderReceiver(balance);
    if (moneyReceiver.id !== jwtPayLoad.r || moneyHolder.id !== jwtPayLoad.h) {
        return NextResponse.json({ message: "Other way around" }, { status: 400 });
    }

    const mollieClient = getClientForUser(moneyReceiver);
    if (!mollieClient) {
        console.error("Could not get mollie client for", moneyReceiver);
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
        const molliePaid = parseInt(molliePayment.amount.value);
        const { amount: decAmount } = moneyHolderReceiverToUsers(moneyHolder, moneyReceiver, molliePaid);
        await prisma.relativeUserBalance.update({
            where: {
                firstUserId_secondUserId: { firstUserId, secondUserId },
            },
            data: {
                amount: {
                    decrement: decAmount,
                },
                lastPaymentDate: new Date(),
                currentMolliePaymentId: null,
            },
        });

        // try {
        //     await prisma.relativeUserBalance.update({
        //         where: {
        //             moneyHolderId_moneyReceiverId: {
        //                 moneyHolderId: jwtPayLoad.r,
        //                 moneyReceiverId: jwtPayLoad.h,
        //             },
        //         },
        //         data: {
        //             amount: {
        //                 set: 0,
        //             },
        //         },
        //     });
        // } catch {}
    }

    return NextResponse.redirect(`${process.env.SERVER_URL}/pay/${params.jwt}?status=${encodeURIComponent(molliePayment.status)}`);
}
