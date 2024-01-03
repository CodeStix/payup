"use client";

import useSWR from "swr";
import {
    Button,
    Text,
    Center,
    Heading,
    Skeleton,
    Flex,
    Card,
    CardBody,
    CardFooter,
    CardHeader,
    Divider,
    Box,
    AvatarGroup,
    Avatar,
    Spacer,
    AvatarBadge,
} from "@chakra-ui/react";
import type { PaymentRequest, User } from "@prisma/client";
import { faArrowRight, faCheck, faPlus, faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { signIn, signOut, useSession } from "next-auth/react";
import { fetcher } from "@/util";
import { useRouter } from "next/navigation";
import { LogOutButton } from "@/components/LogOutButton";
import { AppHeader } from "@/components/AppHeader";
import { useEffect, useState } from "react";

function getUserPayed(request: PaymentRequest & { usersToPay: { user: User; payedAmount: number; partsOfAmount: number }[] }, userId: number) {
    let totalParts = 0;
    request.usersToPay.forEach((e) => (totalParts += e.partsOfAmount));

    let user = request.usersToPay.find((e) => e.user.id === userId);
    if (!user) return false;

    return user.payedAmount >= (user.partsOfAmount / totalParts) * request.amount;
}

export default function HomePage() {
    const router = useRouter();
    const { status: status } = useSession();
    const { data, isLoading } = useSWR<{
        requests: (PaymentRequest & { usersToPay: { user: User; payedAmount: number; partsOfAmount: number }[] })[];
    }>("/api/request", fetcher);
    const [loading, setLoading] = useState(false);

    async function createNew() {
        setLoading(true);
        try {
            const res = await fetch("/api/request", {
                method: "POST",
                body: JSON.stringify({ name: "New request", description: "" }),
            });
            if (res.ok) {
                const req: { request: PaymentRequest } = await res.json();
                router.push(`/request/${req.request.id}`);
            } else {
                console.error(await res.text());
            }
        } catch (ex) {
            setLoading(false);
            throw ex;
        }
    }

    useEffect(() => {
        if (status === "unauthenticated") {
            router.replace("/");
        }
    }, [status]);

    return (
        <Flex style={{ height: "100%", justifyContent: "center" }}>
            <Flex style={{ flexDirection: "column", gap: "2rem", padding: "1rem", width: "400px" }}>
                <AppHeader />

                <Divider />

                <Skeleton isLoaded={!isLoading} minHeight={"4rem"}>
                    <Flex flexDir="column" gap="1rem">
                        <Button
                            isLoading={loading}
                            isDisabled={loading}
                            onClick={createNew}
                            width="100%"
                            colorScheme="green"
                            leftIcon={<FontAwesomeIcon icon={faPlus} />}>
                            Create new payment request
                        </Button>

                        {data?.requests?.map((e) => (
                            <Card
                                key={e.id}
                                // colorScheme="green"
                                background="#eee"
                                shadow="none"
                                _hover={{ transform: "translate(0, -5px)" }}
                                style={{ transition: "100ms" }}
                                cursor="pointer"
                                onClick={() => router.push(`/request/${e.id}`)}>
                                <CardHeader display="flex" alignItems="center">
                                    <Heading size="md">{e.name}</Heading>
                                    <Spacer />
                                    <Text fontSize="x-large">€{e.amount.toFixed(2)}</Text>
                                </CardHeader>
                                <CardBody pt={0}>
                                    <AvatarGroup size="md" max={8}>
                                        {[...e.usersToPay]
                                            .sort((a, b) => a.payedAmount - b.partsOfAmount)
                                            .map((u) => {
                                                const payed = getUserPayed(e, u.user.id);
                                                return (
                                                    <Avatar
                                                        key={u.user.id}
                                                        name={u.user.userName || u.user.email}
                                                        src={u.user.avatarUrl || undefined}>
                                                        <AvatarBadge boxSize="1.25em" bg={payed ? "green.500" : "red.500"}>
                                                            <FontAwesomeIcon color="white" size="2xs" icon={payed ? faCheck : faTimes} />
                                                        </AvatarBadge>
                                                    </Avatar>
                                                );
                                            })}
                                    </AvatarGroup>
                                </CardBody>
                                {/* <CardFooter>
                                    <Button colorScheme="blue">Edit</Button>
                                </CardFooter> */}
                            </Card>
                        ))}
                    </Flex>
                </Skeleton>

                {/* <Box mt={"auto"}></Box>
                <LogOutButton /> */}
            </Flex>
        </Flex>
    );
}
