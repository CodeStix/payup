import { PaymentRequestToUser, PrismaClient, PaymentRequest, PrismaPromise } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/authOptions";
import { calculateUserAmount, getTotalParts, validateStringOrUndefined } from "@/util";
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
                                    paymentPageOpenedDate: true,
                                    lastNotificationDate: true,
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
                                    paymentPageOpenedDate: true,
                                    lastNotificationDate: true,
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

    const body = (await request.json()) as { recalculatePaymentRemoved: boolean };

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

        if (body.recalculatePaymentRemoved === true) {
            const totalParts = getTotalParts(deletedRequest.usersToPay);
            for (const userToPay of deletedRequest.usersToPay) {
                const deletedAmountToPay = calculateUserAmount(totalParts, deletedRequest.amount, userToPay.partsOfAmount!);
                const { amount, firstUserId, secondUserId } = moneyHolderReceiverToUsers(
                    deletedRequest.paidById,
                    userToPay.userId!,
                    deletedAmountToPay
                );
                if (firstUserId !== secondUserId)
                    await prisma.relativeUserBalance.upsert({
                        where: {
                            firstUserId_secondUserId: { firstUserId, secondUserId },
                        },
                        update: {
                            amount: {
                                decrement: amount,
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
        published?: boolean;
    };

    body.name = validateStringOrUndefined(body.name, { maxLength: 30 }) as string;
    if (body.name === null) {
        return NextResponse.json({ name: "Invalid name" }, { status: 400 });
    }
    body.description = validateStringOrUndefined(body.description, { maxLength: 150 }) as string;
    if (body.description === null) {
        return NextResponse.json({ description: "Invalid description" }, { status: 400 });
    }
    if (typeof body.amount !== "undefined" && (typeof body.amount !== "number" || body.amount < 0 || body.amount > 100000)) {
        return NextResponse.json({ amount: "Invalid amount" }, { status: 400 });
    }
    if (typeof body.paidById !== "undefined" && typeof body.paidById !== "number") {
        return NextResponse.json({ paidById: "Invalid paidById" }, { status: 400 });
    }
    if (typeof body.published !== "undefined" && typeof body.published !== "boolean") {
        return NextResponse.json({ published: "Invalid published" }, { status: 400 });
    }
    if (typeof body.usersToPay !== "undefined") {
        if (!Array.isArray(body.usersToPay)) {
            return NextResponse.json({ usersToPay: "Invalid usersToPay" }, { status: 400 });
        }
        for (const userToPay of body.usersToPay) {
            if (
                typeof userToPay.partsOfAmount !== "undefined" &&
                (typeof userToPay.partsOfAmount !== "number" || userToPay.partsOfAmount < 1 || userToPay.partsOfAmount > 100)
            ) {
                NextResponse.json({ usersToPay: "Invalid usersToPay.partsOfAmount" }, { status: 400 });
            }
            if (typeof userToPay.userId !== "undefined" && typeof userToPay.userId !== "number") {
                NextResponse.json({ usersToPay: "Invalid usersToPay.userId" }, { status: 400 });
            }
        }
    }

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
            published: true,
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
    const existingUsersToPayArray = existingRequest.published ? existingRequest.usersToPay : [];
    const existingUsersToPay = new Map<string, Partial<PaymentRequestToUser>>(
        existingUsersToPayArray.map((e) => [getCompositeKey(e.userId, existingRequest.paidById), e])
    );
    const existingTotalParts = getTotalParts(existingUsersToPayArray);

    const bodyUsersToPayArray = body.published ?? existingRequest.published ? body.usersToPay ?? existingRequest.usersToPay : [];
    const bodyPaidById = body.paidById ?? existingRequest.paidById;
    const bodyUsersToPay = new Map<string, Partial<PaymentRequestToUser>>(
        bodyUsersToPayArray.map((e) => [
            getCompositeKey(e.userId, bodyPaidById),
            { ...existingUsersToPay.get(getCompositeKey(e.userId, bodyPaidById)), ...e },
        ])
    );
    const bodyTotalParts = getTotalParts(bodyUsersToPayArray as { partsOfAmount: number }[]);

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
                console.log("Adjusted", [bodyUserToPay.userId!, bodyPaidById], "decrement", diff);

                const { firstUserId, secondUserId, amount } = moneyHolderReceiverToUsers(bodyUserToPay.userId!, bodyPaidById, diff);
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
                                amount: -amount,
                                lastRelatingPaymentRequestId: params.id,
                            },
                        })
                    );
            }
        } else {
            // New was added
            console.log("Added", [bodyUserToPay.userId!, bodyPaidById], "increment", bodyAmount);

            const { firstUserId, secondUserId, amount } = moneyHolderReceiverToUsers(bodyUserToPay.userId!, bodyPaidById, bodyAmount);
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
                            amount: -bodyAmount,
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
        console.log("Deleted", [deletedUserToPay.userId!, existingRequest.paidById], "decrement", deletedAmountToPay);

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
                            increment: amount,
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
                        paymentRequestId: params.id,
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
                published: body.published ?? undefined,
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
                                        paymentPageOpenedDate: true,
                                        lastNotificationDate: true,
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
                                        paymentPageOpenedDate: true,
                                        lastNotificationDate: true,
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
            data: body.usersToPay
                .map((e) => ({ requesterId: currentUser.id, responderId: e.userId }))
                .concat(body.usersToPay.map((e) => ({ requesterId: e.userId, responderId: currentUser.id }))),
        });
    }

    return NextResponse.json({ request: newRequest });
}
