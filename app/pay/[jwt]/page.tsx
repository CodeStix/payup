"use client";

import type { JwtPayload } from "@/notifications";
import { removeEmailDomain } from "@/util";
import { Button, Text, Center, Heading, Skeleton, AlertTitle, Alert, AlertIcon, Flex } from "@chakra-ui/react";
import { faArrowRight, faCheckCircle, faClipboard, faClipboardCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { User } from "@prisma/client";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function Home({ params }: { params: { jwt: string } }) {
    const router = useRouter();
    const [payload, setPayload] = useState<{ paidBy: User; user: User; paid: boolean; paidDate: Date; amount: number; method: "iban" }>();
    const [copied, setCopied] = useState(false);
    const fetchedRef = useRef(false);

    async function fetchPayload(jwt: string) {
        const res = await fetch("/api/pay/" + encodeURIComponent(jwt));
        if (res.ok) {
            setPayload(await res.json());
        } else {
            // TODO show error
            console.error("Could not read payload", await res.text());
        }
    }

    useEffect(() => {
        // Use ref to prevent rendering twice on dev server
        if (!fetchedRef.current) {
            fetchedRef.current = true;
            void fetchPayload(params.jwt);
        }
    }, [params.jwt]);

    return (
        <Center style={{ height: "100%", flexDirection: "column", gap: "1em" }}>
            <Heading as="h1">Pay Up!</Heading>

            <Skeleton isLoaded={!!payload}>
                <Heading as="h2">
                    You still owe {payload?.paidBy.userName} €{payload?.amount.toFixed(2)}!
                </Heading>
            </Skeleton>

            {payload?.paid && payload.paidDate && new Date().getTime() - new Date(payload.paidDate).getTime() > 60 * 1000 && (
                <Alert status="warning" rounded="lg" maxW="lg" flexDir="column">
                    <Flex>
                        <AlertIcon />
                        <AlertTitle>You already paid?</AlertTitle>
                    </Flex>
                    You already opened this link at {new Date(payload.paidDate).toLocaleString()}.
                </Alert>
            )}

            <Skeleton isLoaded={!!payload}>
                <Button
                    size="lg"
                    minW="sm"
                    colorScheme="green"
                    leftIcon={payload?.method === "iban" ? <FontAwesomeIcon icon={copied ? faClipboardCheck : faClipboard} /> : undefined}
                    // rightIcon={<FontAwesomeIcon icon={faArrowRight} />}
                    onClick={() => {
                        if (payload && payload.method === "iban") {
                            void navigator.clipboard.writeText(payload.paidBy.iban!);
                            setCopied(true);
                        }
                    }}>
                    {payload?.method === "iban" && <>{!copied ? <>Copy IBAN to clipboard</> : <>Copied!</>}</>}
                </Button>
            </Skeleton>

            <Skeleton isLoaded={!!payload}>
                <Text style={{ opacity: "0.5", maxWidth: "500px", textAlign: "center" }}>
                    Open your banking app and send €{payload?.amount.toFixed(2) ?? 0} it to{" "}
                    {payload?.paidBy.userName || removeEmailDomain(payload?.paidBy.email ?? "")} ({payload?.paidBy.iban}). You can close this page if
                    you already paid it, you won't be notified again.
                </Text>
            </Skeleton>
        </Center>
    );
}
