"use client";

import { AppText } from "@/components/AppHeader";
import { Button, Text, Center, Heading, Skeleton } from "@chakra-ui/react";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
    const router = useRouter();
    const { status: status } = useSession();

    useEffect(() => {
        if (status === "authenticated") {
            router.push("/request");
        }
    }, [status]);

    return (
        <Center style={{ height: "100%", flexDirection: "column", gap: "1em" }}>
            <AppText />

            <Skeleton isLoaded={status === "unauthenticated"}>
                <Text textAlign="center" style={{ opacity: "0.5" }}>
                    Automatically get paid and reminded about payments.
                </Text>
            </Skeleton>

            <Skeleton isLoaded={status === "unauthenticated"}>
                <Button size="lg" colorScheme="orange" rightIcon={<FontAwesomeIcon icon={faArrowRight} />} onClick={() => signIn("google")}>
                    Create Payment Request
                </Button>
            </Skeleton>
            <Skeleton isLoaded={status === "unauthenticated"}>
                <Text textAlign="center" style={{ opacity: "0.5" }}>
                    You&apos;ll need to log in using Google to create a payment request.
                </Text>
            </Skeleton>
        </Center>
    );
}
