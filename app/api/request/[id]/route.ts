import { PaymentRequestToUser, PrismaClient, PaymentRequest, PrismaPromise } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/authOptions";
import { calculateUserAmount, getTotalParts } from "@/util";
import { moneyHolderReceiverToUsers } from "@/balance";

const prisma = new PrismaClient();

export async function GET(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json(null, { status: 401 });
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
        return NextResponse.json(null, { status: 404 });
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
                orderBy: {
                    createdDate: "desc",
                },
                include: {
                    user: {
                        select: {
                            email: true,
                            id: true,
                            userName: true,
                            avatarUrl: true,
                            firstUserBalances: {
                                where: {
                                    secondUserId: paymentRequest.paidById,
                                },
                                select: {
                                    amount: true,
                                    lastPaymentDate: true,
                                    firstUserId: true,
                                    secondUserId: true,
                                },
                            },
                            secondUserBalances: {
                                where: {
                                    firstUserId: paymentRequest.paidById,
                                },
                                select: {
                                    amount: true,
                                    lastPaymentDate: true,
                                    firstUserId: true,
                                    secondUserId: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    // console.log("payment request", paymentRequest);

    return NextResponse.json(paymentRequest);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({}, { status: 401 });
    }

    await prisma.$transaction(async (prisma) => {
        const deletedRequest = await prisma.paymentRequest.delete({
            where: {
                id: params.id,
                owner: {
                    email: session.user!.email!,
                },
            },
            include: {
                usersToPay: {
                    include: {
                        user: true,
                    },
                },
            },
        });

        const totalParts = getTotalParts(deletedRequest.usersToPay);

        for (const userToPay of deletedRequest.usersToPay) {
            const deletedAmountToPay = calculateUserAmount(totalParts, deletedRequest.amount, userToPay.partsOfAmount!);
            const { amount, firstUserId, secondUserId } = moneyHolderReceiverToUsers(deletedRequest.paidById, userToPay.userId!, deletedAmountToPay);
            if (firstUserId !== secondUserId)
                await prisma.relativeUserBalance.upsert({
                    where: {
                        firstUserId_secondUserId: { firstUserId, secondUserId },
                    },
                    update: {
                        amount: {
                            increment: amount,
                        },
                        lastUpdatedDate: new Date(),
                    },
                    create: {
                        firstUserId,
                        secondUserId,
                        amount: 0,
                    },
                });
        }
    });

    return NextResponse.json({});
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
        paidById?: number;
        usersToPay?: {
            userId: number;
            partsOfAmount?: number;
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
                    user: {
                        select: {
                            id: true,
                        },
                    },
                    partsOfAmount: true,
                },
            },
        },
    });

    if (!existingRequest) {
        return NextResponse.json(undefined, { status: 404 });
    }

    let prismaOperations: PrismaPromise<any>[] = [];

    function getCompositeKey(holderId: number, receiverId: number) {
        return `${holderId}->${receiverId}`;
    }

    // Calculate balance differences between users
    const existingUsersToPay = new Map<string, Partial<PaymentRequestToUser>>(
        existingRequest.usersToPay.map((e) => [getCompositeKey(e.userId, existingRequest.paidById), e])
    );
    const existingTotalParts = getTotalParts(existingRequest.usersToPay);

    const bodyPaidById = body.paidById ?? existingRequest.paidById;
    const bodyUsersToPay = new Map<string, Partial<PaymentRequestToUser>>(
        (body.usersToPay ?? existingRequest.usersToPay).map((e) => [
            getCompositeKey(e.userId, bodyPaidById),
            { ...existingUsersToPay.get(getCompositeKey(e.userId, bodyPaidById)), ...e },
        ])
    );
    const bodyTotalParts = getTotalParts((body.usersToPay ?? existingRequest.usersToPay) as { partsOfAmount: number }[]);

    // console.log("existingUsersToPay", Array.from(existingUsersToPay.values()));
    // console.log("bodyUsersToPay", Array.from(bodyUsersToPay.values()));

    for (const [bodyUserToPayId, bodyUserToPay] of Array.from(bodyUsersToPay.entries())) {
        // console.log(
        //     "calculateUserAmount(bodyTotalParts, body.amount, bodyUserToPay.partsOfAmount!)",
        //     bodyTotalParts,
        //     body.amount,
        //     bodyUserToPay.partsOfAmount!
        // );
        const bodyAmount = calculateUserAmount(bodyTotalParts, body.amount ?? existingRequest.amount, bodyUserToPay.partsOfAmount!);

        const existingUserToPay = existingUsersToPay.get(bodyUserToPayId);
        if (existingUserToPay) {
            // console.log(
            //     "calculateUserAmount(existingTotalParts, existingRequest.amount, existingUserToPay.partsOfAmount!)",
            //     existingTotalParts,
            //     existingRequest.amount,
            //     existingUserToPay.partsOfAmount
            // );
            const existingAmount = calculateUserAmount(existingTotalParts, existingRequest.amount, existingUserToPay.partsOfAmount!);
            const diff = bodyAmount - existingAmount;
            if (diff !== 0) {
                // Was adjusted
                // if (diff >= 0) console.log("Adjusted", [bodyPaidById, bodyUserToPay.userId!], "increment", Math.abs(diff));
                // else console.log("Adjusted", [bodyUserToPay.userId!, bodyPaidById], "increment", Math.abs(diff));

                const { firstUserId, secondUserId, amount } = moneyHolderReceiverToUsers(bodyUserToPay.userId!, bodyPaidById, diff);
                if (firstUserId !== secondUserId)
                    prismaOperations.push(
                        prisma.relativeUserBalance.upsert({
                            where: {
                                firstUserId_secondUserId: { firstUserId, secondUserId },
                            },
                            update: {
                                amount: {
                                    increment: amount,
                                },
                                lastRelatingPaymentRequestId: params.id,
                                lastUpdatedDate: new Date(),
                            },
                            create: {
                                firstUserId,
                                secondUserId,
                                amount: amount,
                                lastRelatingPaymentRequestId: params.id,
                            },
                        })
                    );
            }
        } else {
            // New was added
            // console.log("Added", [bodyPaidById, bodyUserToPay.userId!], "increment", bodyAmount);

            const { firstUserId, secondUserId, amount } = moneyHolderReceiverToUsers(bodyUserToPay.userId!, bodyPaidById, bodyAmount);
            if (firstUserId !== secondUserId)
                prismaOperations.push(
                    prisma.relativeUserBalance.upsert({
                        where: {
                            firstUserId_secondUserId: { firstUserId, secondUserId },
                        },
                        update: {
                            amount: {
                                increment: amount,
                            },
                            lastRelatingPaymentRequestId: params.id,
                            lastUpdatedDate: new Date(),
                        },
                        create: {
                            firstUserId,
                            secondUserId,
                            amount: bodyAmount,
                            lastRelatingPaymentRequestId: params.id,
                        },
                    })
                );
        }

        existingUsersToPay.delete(bodyUserToPayId);
    }

    for (const [, deletedUserToPay] of Array.from(existingUsersToPay.entries())) {
        // Was removed, remove from balance
        // console.log(
        //     "calculateUserAmount(bodyTotalParts, body.amount ?? existingRequest.amount, deletedUserToPay.partsOfAmount!)",
        //     bodyTotalParts,
        //     body.amount ?? existingRequest.amount,
        //     deletedUserToPay.partsOfAmount!
        // );

        const deletedAmountToPay = calculateUserAmount(existingTotalParts, existingRequest.amount, deletedUserToPay.partsOfAmount!);
        // console.log("Deleted", [existingRequest.paidById, deletedUserToPay.userId!], "decrement", deletedAmountToPay);

        const { firstUserId, secondUserId, amount } = moneyHolderReceiverToUsers(
            deletedUserToPay.userId!,
            existingRequest.paidById,
            deletedAmountToPay
        );
        if (firstUserId !== secondUserId)
            prismaOperations.push(
                prisma.relativeUserBalance.upsert({
                    where: {
                        firstUserId_secondUserId: { firstUserId, secondUserId },
                    },
                    update: {
                        amount: {
                            decrement: amount,
                        },
                        lastRelatingPaymentRequestId: params.id,
                        lastUpdatedDate: new Date(),
                    },
                    create: {
                        firstUserId,
                        secondUserId,
                        amount: 0,
                    },
                })
            );
    }

    if (body.usersToPay) {
        // Remove usersToPay from database that were removed from body
        const toDelete = new Set(existingRequest.usersToPay.map((e) => e.userId));
        body.usersToPay.forEach((e) => toDelete.delete(e.userId));

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
                paidById: bodyPaidById,
                amount: body.amount || undefined,
                lastUpdateDate: new Date(),
                usersToPay: body.usersToPay
                    ? {
                          upsert: body.usersToPay.map((u) => ({
                              where: {
                                  userId_paymentRequestId: {
                                      paymentRequestId: params.id,
                                      userId: u.userId,
                                  },
                              },
                              update: {
                                  partsOfAmount: u.partsOfAmount || 1,
                              },
                              create: {
                                  userId: u.userId,
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
                    orderBy: {
                        createdDate: "desc",
                    },
                    include: {
                        user: {
                            select: {
                                email: true,
                                id: true,
                                userName: true,
                                avatarUrl: true,
                                firstUserBalances: {
                                    where: {
                                        secondUserId: bodyPaidById,
                                    },
                                    select: {
                                        amount: true,
                                        lastPaymentDate: true,
                                        firstUserId: true,
                                        secondUserId: true,
                                    },
                                },
                                secondUserBalances: {
                                    where: {
                                        firstUserId: bodyPaidById,
                                    },
                                    select: {
                                        amount: true,
                                        lastPaymentDate: true,
                                        firstUserId: true,
                                        secondUserId: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        })
    );

    let newRequest: PaymentRequest;
    try {
        const res = await prisma.$transaction(prismaOperations);
        // console.log("res", res);
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
            data: body.usersToPay.map((e) => ({ requesterId: currentUser.id, responderId: e.userId })),
        });
    }

    return NextResponse.json({ request: newRequest });
}
