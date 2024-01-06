import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { PrismaClient, User } from "@prisma/client";
import { JwtPayload, generatePaymentLink } from "@/notifications";
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
        select: {
            firstUser: {
                select: {
                    id: true,
                    email: true,
                    avatarUrl: true,
                    userName: true,
                    iban: true,
                    mollieApiKey: true,
                },
            },
            secondUser: {
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
            paymentPageOpenedDate: true,
        },
    });

    if (!balance) {
        return NextResponse.json(null, { status: 404 });
    }

    const { amount, moneyHolder, moneyReceiver } = balanceToMoneyHolderReceiver(balance);

    const paymentMethod = (jwtPayLoad.r === moneyReceiver.id ? moneyReceiver : moneyHolder).mollieApiKey ? "mollie" : "iban";
    moneyReceiver.mollieApiKey = null;
    moneyHolder.mollieApiKey = null;

    return NextResponse.json({
        balance: {
            ...balance,
            amount: amount,
            moneyReceiver: moneyReceiver,
            moneyHolder: moneyHolder,
        },
        user: moneyHolder.id !== jwtPayLoad.h || moneyReceiver.id !== jwtPayLoad.r ? moneyReceiver : moneyHolder,
        amount: jwtPayLoad.o,
        paymentMethod: paymentMethod,
    });
}
