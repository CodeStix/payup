"use client";

import useSWR from "swr";
import { Button, Text, Center, Heading, Skeleton, Flex, Card, CardBody, CardFooter, CardHeader, Divider, Box } from "@chakra-ui/react";
import type { PaymentRequest } from "@prisma/client";
import { faArrowRight, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { signIn, signOut, useSession } from "next-auth/react";
import { fetcher } from "@/util";
import { useRouter } from "next/navigation";
import { LogOutButton } from "@/components/LogOutButton";
import { AppHeader } from "@/components/AppHeader";
import { useState } from "react";

export default function HomePage() {
    const router = useRouter();
    const { status: status } = useSession();
    const { data, isLoading } = useSWR<{ requests: PaymentRequest[] }>("/api/request", fetcher);
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
                            colorScheme="orange"
                            leftIcon={<FontAwesomeIcon icon={faPlus} />}>
                            Create new payment request
                        </Button>

                        {data?.requests?.map((e) => (
                            <Card
                                _hover={{ transform: "translate(0, -5px)" }}
                                style={{ transition: "100ms" }}
                                cursor="pointer"
                                onClick={() => router.push(`/request/${e.id}`)}>
                                <CardHeader>
                                    <Heading size="md">{e.name}</Heading>
                                </CardHeader>
                                <CardBody>
                                    <Text>{e.description}</Text>
                                </CardBody>
                                {/* <CardFooter>
                                <Button>{e.createdDate}</Button>
                            </CardFooter> */}
                            </Card>
                        ))}
                    </Flex>
                </Skeleton>

                <Box mt={"auto"}></Box>
                <LogOutButton />
            </Flex>
        </Flex>
    );
}
