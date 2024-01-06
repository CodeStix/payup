"use client";

import { fetcher, getUserDisplayName, removeEmailDomain } from "@/util";
import { Button, Text, Center, Heading, Skeleton, AlertTitle, Alert, AlertIcon, Flex, Link, Avatar } from "@chakra-ui/react";
import { faArrowRight, faCheckCircle, faClipboard, faClipboardCheck } from "@fortawesome/free-solid-svg-icons";
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

    const searchParams = useSearchParams();
    const paid = searchParams.get("confirm") === "yes";

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
        if (reminder?.opened === false) {
            void updateLink(paid);
        }
    }, [reminder, paid]);

    return (
        <Center style={{ height: "100%", flexDirection: "column", gap: "1em" }} p={4}>
            <AppText />

            <Skeleton isLoaded={!isLoadingReminder && !loading}>
                {paid ? (
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
                You can close this page.
            </Skeleton>

            <Skeleton isLoaded={!isLoadingReminder && !loading}>
                {paid ? (
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
