"use client";

import useSWR from "swr";
import { Button, Text, Center, Heading, Skeleton, Flex, Card, CardBody, CardFooter, CardHeader, Divider } from "@chakra-ui/react";
import type { PaymentRequest } from "@prisma/client";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { signIn, signOut, useSession } from "next-auth/react";
import { fetcher } from "@/util";
import { useRouter } from "next/navigation";
import { LogOutButton } from "@/components/LogOutButton";
import { AppHeader } from "@/components/AppHeader";

export default function Home() {
    const router = useRouter();
    const { status: status } = useSession();
    const { data, isLoading } = useSWR<{ requests: PaymentRequest[] }>("/api/request", fetcher);

    async function createNew() {
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
    }

    return (
        <Flex style={{ height: "100%", justifyContent: "center" }}>
            <Flex style={{ flexDirection: "column", gap: "2rem", padding: "1rem", width: "400px" }}>
                <AppHeader />

                <Divider />

                {/* <Button size="lg" colorScheme="orange" rightIcon={<FontAwesomeIcon icon={faArrowRight} />} onClick={() => signIn("google")}>
                Create Payment Request
            </Button> */}
                <Skeleton isLoaded={!isLoading} minHeight={"2rem"}>
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
                    {data?.requests?.length === 0 && (
                        <Button onClick={createNew} width="100%" colorScheme="orange">
                            Create first payment request
                        </Button>
                    )}
                </Skeleton>

                <LogOutButton />
            </Flex>
        </Flex>
    );
}
