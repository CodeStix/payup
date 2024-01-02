import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    await prisma.paymentRequest.delete({
        where: {
            id: params.id,
        },
    });

    return NextResponse.json({});
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
    console.log("id", params);

    const body = (await request.json()) as {
        name: string;
        description: string;
        usersToPay: {
            email: string;
        }[];
    };

    const newRequest = await prisma.paymentRequest.update({
        where: {
            id: params.id,
        },
        data: {
            description: body.description,
            name: body.name,
        },
    });

    // prisma.user.delete()
    return NextResponse.json({ request: newRequest });
}
