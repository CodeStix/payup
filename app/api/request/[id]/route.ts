import { PaymentRequestToUser, PrismaClient, PaymentRequest, PrismaPromise } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/authOptions";

const prisma = new PrismaClient();

export async function GET(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json(undefined, { status: 401 });
    }

    let paymentRequest = await prisma.paymentRequest.findUnique({
        where: {
            id: params.id,
            owner: {
                email: session.user.email,
            },
        },
        select: { paidById: true },
    });

    if (!paymentRequest) {
        return NextResponse.json(undefined, { status: 404 });
    }

    paymentRequest = await prisma.paymentRequest.findUnique({
        where: {
            id: params.id,
        },
        include: {
            paidBy: {
                select: {
                    email: true,
                    id: true,
                    userName: true,
                    avatarUrl: true,
                },
            },
            usersToPay: {
                include: {
                    user: {
                        select: {
                            email: true,
                            id: true,
                            userName: true,
                            avatarUrl: true,
                            relativeBalanceFirstUsers: {
                                where: {
                                    secondUserId: paymentRequest.paidById,
                                },
                                select: {
                                    amount: true,
                                    lastPaymentDate: true,
                                },
                            },
                            relativeBalanceSecondUsers: {
                                where: {
                                    firstUserId: paymentRequest.paidById,
                                },
                                select: {
                                    amount: true,
                                    lastPaymentDate: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    return NextResponse.json(paymentRequest, { status: !paymentRequest ? 404 : 200 });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({}, { status: 401 });
    }

    await prisma.paymentRequest.delete({
        where: {
            id: params.id,
            owner: {
                email: session.user.email,
            },
        },
    });

    return NextResponse.json({});
}

function getTotalParts(usersToPay: { partsOfAmount: number }[]) {
    let parts = 0;
    usersToPay.forEach((u) => (parts += u.partsOfAmount));
    return parts;
}

function calculateUserAmount(totalPaymentRequestParts: number, totalAmount: number, userParts: number) {
    return (userParts / totalPaymentRequestParts) * totalAmount;
}

function upsertRelativeBalance(userAId: number, userBId: number, userAToBAmount: number) {
    console.log("upsertRelativeBalance", userAId, "->", userBId, "+=", userAToBAmount);

    if (userAId === userBId) {
        console.warn("getRelativeBalance userAId === userBId", userAId, userBId);
        // return  {lastPayment: 0, amount: 0};
    }

    let flip = userAId > userBId;
    return prisma.relativeUserBalance.upsert({
        where: {
            firstUserId_secondUserId: {
                firstUserId: flip ? userBId : userAId,
                secondUserId: flip ? userAId : userBId,
            },
        },
        create: {
            firstUser: {
                connect: {
                    id: flip ? userBId : userAId,
                },
            },
            secondUser: {
                connect: {
                    id: flip ? userAId : userBId,
                },
            },
            // firstUserId: flip ? userBId : userAId,
            // secondUserId: flip ? userAId : userBId,
            amount: flip ? -userAToBAmount : userAToBAmount,
            lastPaymentDate: new Date(),
        },
        update: {
            amount: {
                increment: flip ? -userAToBAmount : userAToBAmount,
            },
            lastPaymentDate: new Date(),
        },
    });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({}, { status: 401 });
    }

    const body = (await request.json()) as {
        name: string;
        description: string;
        amount: number;
        paidBy?: {
            id: number;
        };
        usersToPay?: {
            user: {
                id: number;
            };
            partsOfAmount?: number;
            payedAmount?: number;
        }[];
    };

    const existingRequest = await prisma.paymentRequest.findUnique({
        where: {
            id: params.id,
            owner: {
                email: session.user.email,
            },
        },
        select: {
            paidById: true,
            amount: true,
            usersToPay: {
                select: {
                    userId: true,
                    partsOfAmount: true,
                },
            },
        },
    });

    if (!existingRequest) {
        return NextResponse.json(undefined, { status: 404 });
    }

    let prismaOperations: PrismaPromise<any>[] = [];

    if (body.usersToPay) {
        // Calculate balance differences between users
        const existingUsersToPay = new Map<number, Partial<PaymentRequestToUser>>(existingRequest.usersToPay.map((e) => [e.userId, e]));
        const existingTotalParts = getTotalParts(existingRequest.usersToPay);

        const bodyUsersToPay = new Map<number, Partial<PaymentRequestToUser>>(
            body.usersToPay.map((e) => [e.user.id, { ...existingUsersToPay.get(e.user.id), ...e }])
        );
        const bodyTotalParts = getTotalParts(body.usersToPay as { partsOfAmount: number }[]);

        console.log("existingUsersToPay", Array.from(existingUsersToPay.values()));
        console.log("bodyUsersToPay", Array.from(bodyUsersToPay.values()));

        for (const [bodyUserToPayId, bodyUserToPay] of Array.from(bodyUsersToPay.entries())) {
            console.log(
                "calculateUserAmount(bodyTotalParts, body.amount, bodyUserToPay.partsOfAmount!)",
                bodyTotalParts,
                body.amount,
                bodyUserToPay.partsOfAmount!
            );
            const bodyAmount = calculateUserAmount(bodyTotalParts, body.amount ?? existingRequest.amount, bodyUserToPay.partsOfAmount!);

            const existingUserToPay = existingUsersToPay.get(bodyUserToPayId);
            if (existingUserToPay) {
                console.log(
                    "calculateUserAmount(existingTotalParts, existingRequest.amount, existingUserToPay.partsOfAmount!)",
                    existingTotalParts,
                    existingRequest.amount,
                    existingUserToPay.partsOfAmount
                );
                const existingAmount = calculateUserAmount(existingTotalParts, existingRequest.amount, existingUserToPay.partsOfAmount!);
                const diff = bodyAmount - existingAmount;
                if (diff !== 0) {
                    // Was adjusted
                    prismaOperations.push(upsertRelativeBalance(bodyUserToPayId, existingRequest.paidById, diff));
                }
            } else {
                // New was added
                prismaOperations.push(upsertRelativeBalance(bodyUserToPayId, existingRequest.paidById, bodyAmount));
            }

            existingUsersToPay.delete(bodyUserToPayId);
        }

        for (const [deletedUserToPayId, deletedUserToPay] of Array.from(existingUsersToPay.entries())) {
            // Was removed, remove from balance
            const deletedAmountTopay = calculateUserAmount(bodyTotalParts, body.amount ?? existingRequest.amount, deletedUserToPay.partsOfAmount!);
            prismaOperations.push(upsertRelativeBalance(deletedUserToPayId, existingRequest.paidById, -deletedAmountTopay));
        }
    }

    if (body.usersToPay) {
        // Remove usersToPay from database that were removed from body
        const toDelete = new Set(existingRequest.usersToPay.map((e) => e.userId));
        body.usersToPay.forEach((e) => toDelete.delete(e.user.id));

        if (toDelete.size > 0) {
            prismaOperations.push(
                prisma.paymentRequestToUser.deleteMany({
                    where: {
                        userId: {
                            in: Array.from(toDelete),
                        },
                    },
                })
            );
        }
    }

    prismaOperations.push(
        prisma.paymentRequest.update({
            where: {
                id: params.id,
                owner: {
                    email: session.user.email,
                },
            },
            data: {
                description: body.description || "",
                name: body.name || undefined,
                paidById: body.paidBy?.id || undefined,
                amount: body.amount || undefined,
                usersToPay: body.usersToPay
                    ? {
                          upsert: body.usersToPay.map((u) => ({
                              where: {
                                  userId_paymentRequestId: {
                                      paymentRequestId: params.id,
                                      userId: u.user.id,
                                  },
                              },
                              update: {
                                  partsOfAmount: u.partsOfAmount || 1,
                              },
                              create: {
                                  userId: u.user.id,
                                  partsOfAmount: u.partsOfAmount || 1,
                              },
                          })),
                      }
                    : {},
            },
            include: {
                paidBy: {
                    select: {
                        email: true,
                        id: true,
                        userName: true,
                        avatarUrl: true,
                    },
                },
                usersToPay: {
                    include: {
                        user: {
                            select: {
                                email: true,
                                id: true,
                                userName: true,
                                avatarUrl: true,
                                relativeBalanceFirstUsers: {
                                    where: {
                                        secondUserId: existingRequest.paidById,
                                    },
                                    select: {
                                        amount: true,
                                        lastPaymentDate: true,
                                    },
                                },
                                relativeBalanceSecondUsers: {
                                    where: {
                                        firstUserId: existingRequest.paidById,
                                    },
                                    select: {
                                        amount: true,
                                        lastPaymentDate: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: [{ createdDate: "asc" }],
                },
            },
        })
    );

    let newRequest: PaymentRequest;
    try {
        const res = await prisma.$transaction(prismaOperations);
        console.log("res", res);
        newRequest = res[res.length - 1];
    } catch (ex) {
        console.error("Could not update request", ex);
        return NextResponse.json(undefined, { status: 500 });
    }

    if (body.usersToPay) {
        // Create friending users
        const currentUser = await prisma.user.findUniqueOrThrow({
            where: {
                email: session.user.email,
            },
            select: {
                id: true,
            },
        });
        await prisma.userToUser.createMany({
            skipDuplicates: true,
            data: body.usersToPay.map((e) => ({ requesterId: currentUser.id, responderId: e.user.id })),
        });
    }

    return NextResponse.json({ request: newRequest });
}
