"use client";

import { Button, Text, Center, Heading } from "@chakra-ui/react";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { signIn, signOut, useSession } from "next-auth/react";

export default function Home() {
    const { data: session } = useSession();

    return (
        <Center style={{ height: "100%", flexDirection: "column", gap: "1em" }}>
            <Heading as="h1">Pay Up!</Heading>
            <Button size="lg" colorScheme="orange" rightIcon={<FontAwesomeIcon icon={faArrowRight} />} onClick={() => signIn("google")}>
                Create Payment Request
            </Button>
            <Text style={{ opacity: "0.5" }}>You'll need to log in using Google to create a payment request.</Text>
            <pre>{JSON.stringify(session, null, 2)}</pre>
            <Button onClick={() => signOut()}>log out</Button>
        </Center>
    );
}
