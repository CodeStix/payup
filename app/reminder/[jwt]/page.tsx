"use client";

import { fetcher, getUserDisplayName, removeEmailDomain } from "@/util";
import { Button, Text, Center, Heading, Skeleton, AlertTitle, Alert, AlertIcon, Flex, Link, Avatar } from "@chakra-ui/react";
import { faArrowRight, faCheckCircle, faClipboard, faClipboardCheck, faTimesCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { PaymentCheckReminder, RelativeUserBalance, User } from "@prisma/client";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { AppText } from "@/components/AppHeader";

export default function Home({ params }: { params: { jwt: string } }) {
    const { data: reminder, isLoading: isLoadingReminder } = useSWR<PaymentCheckReminder & { moneyHolder: User; moneyReceiver: User }>(
        `/api/reminder/${params.jwt}`,
        fetcher,
        {
            revalidateOnReconnect: false,
            revalidateOnFocus: false,
            revalidateIfStale: false,
        }
    );

    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const searchParams = useSearchParams();
    const mailClickedPaid = searchParams.get("confirm") === "yes";

    async function updateLink(paid: boolean) {
        setLoading(true);
        try {
            const res = await fetch(`/api/reminder/${params.jwt}`, {
                method: "POST",
                body: JSON.stringify({
                    paid,
                }),
            });
            if (!res.ok) {
                console.error("Could not update link", await res.text());
            }
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (reminder && reminder.confirmed === null) {
            void updateLink(mailClickedPaid);
        }
    }, [reminder, mailClickedPaid]);

    return (
        <Center style={{ height: "100%", flexDirection: "column", gap: "1em" }} p={4}>
            <AppText />

            <Skeleton isLoaded={!isLoadingReminder && !loading}>
                {typeof reminder?.confirmed === "boolean" ? (
                    <Heading color="red.500" textAlign="center">
                        Invalid link
                    </Heading>
                ) : mailClickedPaid ? (
                    <Heading color="green.500" textAlign="center">
                        Thanks for confirming!
                    </Heading>
                ) : (
                    <Heading color="orange.500" textAlign="center">
                        We'll notify {reminder?.moneyHolder && getUserDisplayName(reminder?.moneyHolder)} again shortly.
                    </Heading>
                )}
            </Skeleton>

            <Skeleton isLoaded={!isLoadingReminder && !loading} textAlign="center">
                {typeof reminder?.confirmed === "boolean" ? (
                    <Text>
                        You already marked this transaction as{" "}
                        {reminder.confirmed ? (
                            <Text as="span" color="green.500" fontWeight="semibold">
                                <FontAwesomeIcon icon={faCheckCircle} /> Paid
                            </Text>
                        ) : (
                            <Text as="span" color="red.500" fontWeight="semibold">
                                <FontAwesomeIcon icon={faTimesCircle} /> Didn't pay
                            </Text>
                        )}
                        .
                    </Text>
                ) : (
                    <Text>You can close this page.</Text>
                )}
            </Skeleton>

            {/* {typeof reminder?.confirmed === "boolean" && (
                <Alert status="error" rounded="lg" w="xs" flexDir="column" textAlign="center">
                    <Flex>
                        <AlertIcon />
                        <AlertTitle>You already opened this link</AlertTitle>
                    </Flex>
                    This link isn't valid anymore. Please wait until next email to confirm again.
                </Alert>
            )} */}

            <Skeleton isLoaded={!isLoadingReminder && !loading}>
                {typeof reminder?.confirmed === "boolean" ? (
                    <Text opacity={0.5} textAlign="center" maxW="lg">
                        If you want to change this transaction, please add a new payment request or manual transaction in{" "}
                        <Button onClick={() => router.replace("/request")} variant="link">
                            Pay Up!
                        </Button>{" "}
                        Or wait for the next notification if you pressed no.
                    </Text>
                ) : mailClickedPaid ? (
                    <Text opacity={0.5} textAlign="center">
                        We won't bother both of you again.
                    </Text>
                ) : (
                    <Text opacity={0.5} textAlign="center">
                        We'll send you another payment check reminder soon.
                    </Text>
                )}

                {reminder?.moneyReceiver && (
                    <Text as="p" opacity={0.5} textAlign="center">
                        Logged in as{" "}
                        <Avatar
                            size="xs"
                            name={getUserDisplayName(reminder.moneyReceiver)}
                            src={reminder.moneyReceiver.avatarUrl || undefined}></Avatar>{" "}
                        {getUserDisplayName(reminder.moneyReceiver)}.{" "}
                        <Button onClick={() => alert("This page is not meant for you, please close it")} variant="link">
                            Not you?
                        </Button>
                    </Text>
                )}
            </Skeleton>
        </Center>
    );
}
