"use client";

import useSWR from "swr";
import { Button, Text, Center, Heading } from "@chakra-ui/react";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { signIn, useSession } from "next-auth/react";
import { fetcher } from "@/util";

export default function Home() {
    // const { data: session } = useSession();
    const { data } = useSWR("/api/request", fetcher);

    return (
        <Center style={{ height: "100%", flexDirection: "column", gap: "1em" }}>
            {/* <Heading as="h1">Pay Up!</Heading> */}
            {/* <Button size="lg" colorScheme="orange" rightIcon={<FontAwesomeIcon icon={faArrowRight} />} onClick={() => signIn("google")}>
                Create Payment Request
            </Button> */}
            <Text as="p">Logged in</Text>
            {/* <Text style={{ opacity: "0.5" }}>You'll need to log in using Google to create a payment request.</Text> */}
            <pre>{JSON.stringify({ data }, null, 2)}</pre>
        </Center>
    );
}
