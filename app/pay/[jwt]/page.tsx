"use client";

import { fetcher, getUserDisplayName, removeEmailDomain } from "@/util";
import { Button, Text, Center, Heading, Skeleton, AlertTitle, Alert, AlertIcon, Flex, Link } from "@chakra-ui/react";
import { faArrowRight, faCheckCircle, faClipboard, faClipboardCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { RelativeUserBalance, User } from "@prisma/client";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import Confetti from "react-confetti";

export default function Home({ params }: { params: { jwt: string } }) {
    const {
        data: link,
        isLoading: isLoadingLink,
        mutate: mutateLink,
    } = useSWR<{
        amount: number;
        balance: RelativeUserBalance & { lastRelatingPaymentRequest?: { name: string }; moneyHolder: User; moneyReceiver: User };
        otherWayBalance?: RelativeUserBalance & { lastRelatingPaymentRequest?: { name: string } };
        paymentMethod: "mollie" | "iban";
    }>(`/api/pay/${params.jwt}`, fetcher, {
        revalidateOnReconnect: false,
        revalidateOnFocus: false,
        revalidateIfStale: false,
    });

    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const paidRef = useRef(false);

    const lastPaymentDate = link?.balance.lastPaymentDate;
    const amount = !link ? null : link.otherWayBalance ? link.balance.amount - link.otherWayBalance.amount : link.balance.amount;
    const paid = amount !== null && amount < 0.01;

    const searchParams = useSearchParams();

    async function payUsingMollie() {
        let prevLoading = loading;
        setLoading(true);
        try {
            const res = await fetch(`/api/pay/${encodeURIComponent(params.jwt)}/mollie`, {
                method: "POST",
            });

            if (!res.ok) {
                console.error("Could not pay using mollie", await res.text());
            } else {
                const data = await res.json();
                console.log("Mollie payment", data);
                location.href = data.checkoutUrl;
                prevLoading = true;
            }
        } finally {
            setLoading(prevLoading);
        }
    }

    async function payUsingIban() {
        const prevLoading = loading;
        setLoading(true);
        try {
            const res = await fetch(`/api/pay/${encodeURIComponent(params.jwt)}/iban`, {
                method: "POST",
            });

            if (!res.ok) {
                console.error("Could not pay using iban", await res.text());
            } else {
                // Next time the user refreshes the UI will update
            }
        } finally {
            setLoading(prevLoading);
        }
    }

    useEffect(() => {
        if (link) {
            if (link.paymentMethod === "iban") {
                // Pay automatically
                if (!paidRef.current) {
                    paidRef.current = true;
                    void payUsingIban();
                }
            }
        }
    }, [link]);

    return (
        <Center style={{ height: "100%", flexDirection: "column", gap: "1em" }}>
            <Heading as="h1">Pay Up!</Heading>

            <Skeleton isLoaded={!!link} minW="400px">
                {link?.paymentMethod === "mollie" ? (
                    <>
                        {paid ? (
                            searchParams.get("status") === "paid" ? (
                                <Heading color="green.500" textAlign="center">
                                    <Confetti />
                                    You just paid {link.balance.moneyReceiver && getUserDisplayName(link.balance.moneyReceiver)}!
                                </Heading>
                            ) : (
                                <Heading color="green.500" textAlign="center">
                                    You already paid {link.balance.moneyReceiver && getUserDisplayName(link.balance.moneyReceiver)}!
                                </Heading>
                            )
                        ) : (
                            <Heading as="h2" textAlign="center">
                                You still owe {link.balance.moneyReceiver && getUserDisplayName(link.balance.moneyReceiver)} €{amount?.toFixed(2)}!
                            </Heading>
                        )}
                    </>
                ) : (
                    <>
                        {paid ? (
                            <Heading color="yellow.500" textAlign="center">
                                You could still be owing €{link?.amount?.toFixed(2)} to{" "}
                                {link?.balance.moneyReceiver && getUserDisplayName(link.balance.moneyReceiver)}!
                            </Heading>
                        ) : (
                            <Heading as="h2" textAlign="center">
                                You still owe {link?.balance.moneyReceiver && getUserDisplayName(link.balance.moneyReceiver)} €{amount?.toFixed(2)}!
                            </Heading>
                        )}
                    </>
                )}
            </Skeleton>

            <Skeleton isLoaded={!!link} minW="300px" textAlign="center">
                {link?.balance.lastRelatingPaymentRequest && <>For {link.balance.lastRelatingPaymentRequest.name}.</>}

                {link?.otherWayBalance?.lastRelatingPaymentRequest &&
                    link.otherWayBalance.lastRelatingPaymentRequest.name !== link.balance.lastRelatingPaymentRequest?.name && (
                        <>
                            {" "}
                            (This includes the money that {getUserDisplayName(link.balance.moneyReceiver)} stills ows you for{" "}
                            {link.otherWayBalance.lastRelatingPaymentRequest.name})
                        </>
                    )}
            </Skeleton>

            {/* && (!lastPaymentDate || new Date().getTime() - new Date(lastPaymentDate).getTime() > 60 * 1000) */}
            {link?.paymentMethod === "iban" && paid && (
                <Alert status="warning" rounded="lg" maxW="sm" flexDir="column" textAlign="center">
                    <Flex>
                        <AlertIcon />
                        <AlertTitle>You already paid?</AlertTitle>
                    </Flex>
                    You already opened this link{lastPaymentDate && <> at {new Date(lastPaymentDate).toLocaleString()}</>}.
                </Alert>
            )}

            <Skeleton isLoaded={!!link}>
                {link?.paymentMethod === "mollie" ? (
                    <Button
                        isDisabled={loading || isLoadingLink || paid}
                        isLoading={loading || isLoadingLink}
                        size="lg"
                        minW="sm"
                        colorScheme="green"
                        rightIcon={<FontAwesomeIcon icon={paid ? faCheckCircle : faArrowRight} />}
                        onClick={() => {
                            setLoading(true);
                            void payUsingMollie();
                        }}>
                        {paid ? <>You already paid!</> : <>Select your bank</>}
                    </Button>
                ) : (
                    <Button
                        isDisabled={loading || isLoadingLink}
                        isLoading={loading || isLoadingLink}
                        size="lg"
                        minW="sm"
                        colorScheme="green"
                        leftIcon={<FontAwesomeIcon icon={copied ? faClipboardCheck : faClipboard} />}
                        // rightIcon={<FontAwesomeIcon icon={faArrowRight} />}
                        onClick={() => {
                            if (link && link.paymentMethod === "iban") {
                                void navigator.clipboard.writeText(link.balance.moneyReceiver.iban!);
                                setCopied(true);
                            }
                        }}>
                        {!copied ? <>Copy IBAN to clipboard</> : <>Copied!</>}
                    </Button>
                )}
            </Skeleton>

            <Skeleton isLoaded={!!link}>
                <Text style={{ opacity: "0.5", maxWidth: "500px", textAlign: "center", minHeight: "2rem" }} textAlign="center">
                    {link?.paymentMethod === "mollie" ? (
                        <>
                            {getUserDisplayName(link.balance.moneyReceiver)} selected{" "}
                            <Link target="_blank" href="https://mollie.com">
                                mollie
                            </Link>{" "}
                            as their preferred payment method.
                        </>
                    ) : (
                        <>
                            Open your banking app and send €{amount?.toFixed(2) ?? 0} to {link && getUserDisplayName(link.balance.moneyReceiver)} (
                            {link?.balance.moneyReceiver.iban}). This link detects if you paid or not.
                            {/* You can close this page if you already paid it, you won&apos;t be notified again. */}
                        </>
                    )}
                </Text>
            </Skeleton>
        </Center>
    );
}
