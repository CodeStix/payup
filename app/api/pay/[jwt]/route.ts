import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { PaymentLink, PrismaClient, User } from "@prisma/client";
import { getClientForUser } from "@/mollie";
import { PaymentStatus } from "@mollie/api-client";

const prisma = new PrismaClient();

async function completeLinkPayment(link: PaymentLink): Promise<PaymentLink> {
    return await prisma.$transaction(async (prisma) => {
        for (const { paymentRequestId, amount, userId } of link.amountPerPaymentRequest as {
            paymentRequestId: string;
            amount: number;
            userId: number;
        }[]) {
            await prisma.paymentRequestToUser.update({
                where: {
                    userId_paymentRequestId: {
                        userId: userId,
                        paymentRequestId: paymentRequestId!,
                    },
                },
                data: {
                    payedAmount: {
                        increment: amount,
                    },
                    lastPaymentDate: new Date(),
                },
            });
        }

        return await prisma.paymentLink.update({
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

export type PayResponse = /*Partial<PaymentLink> & { receivingUser: User; sendingUser: User } &*/ {
    paymentMethod: string;
    paid: boolean;
    paidDate?: Date | null;
    status?: string;
    checkoutUrl?: string;
};

export async function GET(request: NextRequest, { params }: { params: { jwt: string } }): Promise<NextResponse> {
    let link = await prisma.paymentLink.findUnique({
        where: {
            id: params.jwt,
        },
        select: {
            amount: true,
            id: true,
            paid: true,
            paidDate: true,
            paymentMethod: true,
            molliePaymentId: true,
            amountPerPaymentRequest: true,
            receivingUser: {
                select: {
                    email: true,
                    id: true,
                    userName: true,
                    avatarUrl: true,
                },
            },
            sendingUser: {
                select: {
                    iban: true,
                    email: true,
                    id: true,
                    userName: true,
                    avatarUrl: true,
                },
            },
        },
    });

    if (!link) {
        return NextResponse.json(undefined, { status: 404 });
    }

    let mollieClient;
    if (link.paymentMethod === "mollie" && link.molliePaymentId && (mollieClient = getClientForUser(link.sendingUser))) {
        const payment = await mollieClient.payments.get(link.molliePaymentId);
        return NextResponse.json({ ...link, molliePaymentId: undefined, status: payment.status, checkoutUrl: payment.getCheckoutUrl() });
    }

    return NextResponse.json(link);
}

export async function POST(request: NextRequest, { params }: { params: { jwt: string } }): Promise<NextResponse> {
    // let jwtPayLoad: JwtPayload;
    // try {
    //     const jwtString = decodeURIComponent(params.jwt);
    //     jwtPayLoad = jwt.verify(jwtString, process.env.JWT_SECRET!) as JwtPayload;
    // } catch (ex) {
    //     console.error("Could not parse jwt", ex);
    //     return NextResponse.json({}, { status: 400 });
    // }

    // console.log("jwt", jwtPayLoad);

    let link = await prisma.paymentLink.findUnique({
        where: {
            id: params.jwt,
        },
        include: {
            receivingUser: true,
            sendingUser: true,
        },
    });

    if (!link) {
        return NextResponse.json(undefined, { status: 404 });
    }

    const response: PayResponse = {
        // id: link.id,
        paid: link.paid,
        paidDate: link.paidDate,
        paymentMethod: link.paymentMethod,
    };

    if (link.paid) {
        return NextResponse.json(response);
    }

    if (link.paymentMethod === "mollie") {
        if (link.molliePaymentId) {
            // Check if active mollie payment is completed
            const mollieClient = getClientForUser(link.sendingUser);
            if (!mollieClient) {
                console.error("Could not get mollie client for", link.sendingUser);
                return NextResponse.json(undefined, { status: 500 });
            }

            const payment = await mollieClient.payments.get(link.molliePaymentId);
            response.status = payment.status;
            response.checkoutUrl = payment.getCheckoutUrl()!;

            if (payment.status === PaymentStatus.paid) {
                link = { ...link, ...(await completeLinkPayment(link)) };
            }
        } else if (typeof link.sendingUser.mollieApiKey === "string") {
            // Use mollie because user has registered api key for it
            const mollieClient = getClientForUser(link.sendingUser);
            if (!mollieClient) {
                console.error("Could not get mollie client for", link.sendingUser);
                return NextResponse.json(undefined, { status: 500 });
            }

            const payment = await mollieClient.payments.create({
                amount: {
                    currency: "EUR",
                    value: link.amount.toFixed(2),
                },
                description: "No description yet",
                redirectUrl: `${process.env.SERVER_URL}/pay/${link.id}`,
            });

            await prisma.paymentLink.update({
                where: {
                    id: link.id,
                },
                data: {
                    molliePaymentId: payment.id,
                },
                include: {
                    receivingUser: true,
                    sendingUser: true,
                },
            });

            response.status = payment.status;
            response.checkoutUrl = payment.getCheckoutUrl()!;
        } else {
            console.error("User doesn't have mollie anymore", link.sendingUser);
            return NextResponse.json(undefined, { status: 400 });
        }
    } else {
        // Pay automatically, we expect the user to pay manually using iban
        link = { ...link, ...(await completeLinkPayment(link)) };
    }

    response.paid = link.paid;
    response.paidDate = link.paidDate;

    return NextResponse.json(response);

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
}
