import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "../../auth/[...nextauth]/route";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(request: NextRequest): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({}, { status: 401 });
    }

    const query = request.nextUrl.searchParams.get("query");
    if (typeof query !== "string" /* || query.length > 40 || query.length < 1*/) {
        return NextResponse.json([]);
    }

    const users = await prisma.user.findMany({
        where: {
            OR: [
                {
                    email: query,
                },
                {
                    AND: [
                        {
                            responders: {
                                some: {
                                    requester: {
                                        email: session.user.email,
                                    },
                                },
                            },
                            OR: [
                                {
                                    email: {
                                        mode: "insensitive",
                                        contains: query,
                                    },
                                },
                                {
                                    userName: {
                                        mode: "insensitive",
                                        contains: query,
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        select: {
            email: true,
            avatarUrl: true,
            id: true,
            userName: true,
        },
        take: 5,
        orderBy: {
            email: "asc",
        },
    });

    return NextResponse.json(users);
}
