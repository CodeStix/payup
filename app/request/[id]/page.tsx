"use client";

import { LogOutButton } from "@/components/LogOutButton";
import { fetcher } from "@/util";
import { Flex, Heading, Skeleton, Button } from "@chakra-ui/react";
import { useSession, signOut } from "next-auth/react";
import useSWR from "swr";

export default function Home({ params }: { params: { id: string } }) {
    const { status: status } = useSession();
    const { data, isLoading } = useSWR<{ request: PaymentRequest }>("/api/request/" + params.id, fetcher);

    return (
        <Flex style={{ height: "100%", justifyContent: "center" }}>
            <Flex style={{ flexDirection: "column", gap: "1rem", padding: "1rem", width: "400px" }}>
                <Heading textAlign="center" as="h1">
                    Pay Up!
                </Heading>

                {/* <Button size="lg" colorScheme="orange" rightIcon={<FontAwesomeIcon icon={faArrowRight} />} onClick={() => signIn("google")}>
                Create Payment Request
            </Button> */}
                <Skeleton isLoaded={!isLoading} minHeight={"2rem"}>
                    <pre>{JSON.stringify(data, null, 2)}</pre>
                    {/* {data?.requests.map((e) => (
                        <p>{e.name}</p>
                    ))} */}
                    {/* {data?.requests.length === 0 && <Button colorScheme="orange">Create first payment request</Button>} */}
                </Skeleton>

                {/* <pre>{JSON.stringify({ data }, null, 2)}</pre> */}

                <LogOutButton />
            </Flex>
        </Flex>
    );
}
