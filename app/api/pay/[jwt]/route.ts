import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { JwtPayload } from "@/notifications";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(request: NextRequest, { params }: { params: { jwt: string } }): Promise<NextResponse> {
    // let jwtPayLoad: JwtPayload;
    // try {
    //     const jwtString = decodeURIComponent(params.jwt);
    //     jwtPayLoad = jwt.verify(jwtString, process.env.JWT_SECRET!) as JwtPayload;
    // } catch (ex) {
    //     console.error("Could not parse jwt", ex);
    //     return NextResponse.json({}, { status: 400 });
    // }

    // console.log("jwt", jwtPayLoad);

    const link = await prisma.paymentLink.findUnique({
        where: {
            id: params.jwt,
        },
        include: {
            receivingUser: true,
            sendingUser: true,
        },
    });

    if (!link) {
        return NextResponse.json({}, { status: 404 });
    }

    if (!link.paid) {
        await prisma.$transaction(async (prisma) => {
            for (const { paymentRequestId, amount } of link.amountPerPaymentRequest as { paymentRequestId: string; amount: number }[]) {
                await prisma.paymentRequestToUser.update({
                    where: {
                        userId_paymentRequestId: {
                            userId: amount >= 0 ? link.sendingUserId : link.receivingUserId,
                            paymentRequestId: paymentRequestId!,
                        },
                    },
                    data: {
                        payedAmount: {
                            increment: Math.abs(amount),
                        },
                        lastPaymentDate: new Date(),
                    },
                });
            }

            await prisma.paymentLink.update({
                where: {
                    id: link.id,
                },
                data: {
                    paid: true,
                    paidDate: new Date(),
                },
            });
        });
    }

    /*await prisma.$transaction(async (prisma) => {
        let paidAmount = jwtPayLoad.amount;

        const payedRequests = await prisma.paymentRequestToUser.findMany({
            where: {
                paymentComplete: false,
                userId: jwtPayLoad.paidBy.id!,
                paymentRequest: {
                    paidById: jwtPayLoad.user.id!,
                },
            },
            include: {
                paymentRequest: {
                    select: {
                        amount: true,
                        usersToPay: {
                            select: {
                                partsOfAmount: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                createdDate: "asc",
            },
        });

        for (const payedRequest of payedRequests) {
            let partsInRequest = 0;
            payedRequest.paymentRequest.usersToPay.forEach((e) => (partsInRequest += e.partsOfAmount));
            const shouldReceive = (payedRequest.partsOfAmount / partsInRequest) * payedRequest.paymentRequest.amount - payedRequest.payedAmount;
            paidAmount += shouldReceive;
        }

        const requestedToPay = await prisma.paymentRequestToUser.findMany({
            where: {
                paymentComplete: false,
                userId: jwtPayLoad.user.id!,
                paymentRequest: {
                    paidById: jwtPayLoad.paidBy.id!,
                },
            },
            include: {
                paymentRequest: {
                    select: {
                        amount: true,
                        usersToPay: {
                            select: {
                                partsOfAmount: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                createdDate: "asc",
            },
        });

        for (let i = 0; i < requestedToPay.length; i++) {
            const shouldPay = requestedToPay[i];
            let partsInRequest = 0;
            shouldPay.paymentRequest.usersToPay.forEach((e) => (partsInRequest += e.partsOfAmount));
            const ows = (shouldPay.partsOfAmount / partsInRequest) * shouldPay.paymentRequest.amount - shouldPay.payedAmount;

            if (i === requestedToPay.length - 1) {
                // This is the last entry, put remaining paid money in here
                await prisma.paymentRequestToUser.update({
                    where: {
                        userId_paymentRequestId: {
                            paymentRequestId: shouldPay.paymentRequestId,
                            userId: shouldPay.userId,
                        },
                    },
                    data: {
                        paymentComplete: Math.abs(ows - paidAmount) < 0.01,
                        payedAmount: ows - paidAmount,
                    },
                });
                console.log("Last settle", paidAmount, ows, shouldPay);
            } else if (paidAmount >= ows) {
                // Able to settle
                paidAmount -= ows;
                await prisma.paymentRequestToUser.update({
                    where: {
                        userId_paymentRequestId: {
                            paymentRequestId: shouldPay.paymentRequestId,
                            userId: shouldPay.userId,
                        },
                    },
                    data: {
                        paymentComplete: true,
                        payedAmount: ows,
                    },
                });
                console.log("Settled", paidAmount, ows, shouldPay);
            } else {
                // Could not fully settle
                console.log("Could not settle", paidAmount, ows, shouldPay);

                await prisma.paymentRequestToUser.update({
                    where: {
                        userId_paymentRequestId: {
                            paymentRequestId: shouldPay.paymentRequestId,
                            userId: shouldPay.userId,
                        },
                    },
                    data: {
                        paymentComplete: false,
                        payedAmount: paidAmount,
                    },
                });
                break;
            }
        }
    });*/

    return NextResponse.json({
        paidBy: link.sendingUser,
        user: link.receivingUser,
        paid: link.paid,
        paidDate: link.paidDate?.getTime(),
        amount: link.amount,
        method: "iban",
    });
}
