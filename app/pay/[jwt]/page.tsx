"use client";

import { fetcher, getUserDisplayName, removeEmailDomain } from "@/util";
import { Button, Text, Center, Heading, Skeleton, AlertTitle, Alert, AlertIcon, Flex, Link, Avatar } from "@chakra-ui/react";
import { faArrowRight, faCheckCircle, faClipboard, faClipboardCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { PaymentMethod, RelativeUserBalance, User } from "@prisma/client";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import Confetti from "react-confetti";
import { AppText } from "@/components/AppHeader";

export default function Home({ params }: { params: { jwt: string } }) {
    const {
        data: link,
        isLoading: isLoadingLink,
        mutate: mutateLink,
    } = useSWR<{
        amount: number;
        balance: RelativeUserBalance & { lastRelatingPaymentRequest?: { name: string }; moneyHolder: User; moneyReceiver: User };
        user: User;
        paymentMethod: PaymentMethod;
    }>(`/api/pay/${params.jwt}`, fetcher, {
        revalidateOnReconnect: false,
        revalidateOnFocus: false,
        revalidateIfStale: false,
    });

    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const paidRef = useRef(false);

    const lastPaymentDate = link?.balance.lastPaymentDate;
    const amount = link?.balance.amount ?? null;
    const paid = amount !== null && amount < 0.01;
    const shouldPayMoney = link?.user.id === link?.balance.moneyHolder.id;
    const previouslyOpenedAt = link?.balance.paymentPageOpenedDate ? new Date(link.balance.paymentPageOpenedDate) : null;

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
            if (shouldPayMoney && link.paymentMethod === "IBAN") {
                // Pay automatically
                if (!paidRef.current) {
                    paidRef.current = true;
                    void payUsingIban();
                }
            }
        }
    }, [link]);

    return (
        <Center style={{ height: "100%", flexDirection: "column", gap: "1em" }} p={4}>
            <AppText />

            <Skeleton isLoaded={!!link}>
                {paid ? (
                    searchParams.get("status") === "paid" ? (
                        <Heading color="green.500" textAlign="center">
                            <Confetti />
                            You just paid {link?.balance.moneyReceiver && getUserDisplayName(link.balance.moneyReceiver)}!
                        </Heading>
                    ) : (
                        <Heading color="green.500" textAlign="center">
                            You and {link?.balance.moneyReceiver && getUserDisplayName(link.balance.moneyReceiver)} are even!
                        </Heading>
                    )
                ) : !shouldPayMoney ? (
                    <Heading as="h2" color="yellow.500" textAlign="center">
                        {link?.balance.moneyHolder && getUserDisplayName(link.balance.moneyHolder)} still ows you €{link?.balance.amount?.toFixed(2)}!
                    </Heading>
                ) : link?.paymentMethod === "IBAN" && previouslyOpenedAt ? (
                    <Heading color="yellow.500" textAlign="center">
                        You could still be owing €{link?.amount?.toFixed(2)} to{" "}
                        {link?.balance.moneyReceiver && getUserDisplayName(link.balance.moneyReceiver)}!
                    </Heading>
                ) : (
                    <Heading as="h2" textAlign="center">
                        You still owe {link?.balance.moneyReceiver && getUserDisplayName(link.balance.moneyReceiver)} €{amount?.toFixed(2)}!
                    </Heading>
                )}
            </Skeleton>

            <Skeleton isLoaded={!!link} textAlign="center">
                {paid ? (
                    <Text>You don't have to do anything. You can close this page.</Text>
                ) : link?.balance.lastRelatingPaymentRequest ? (
                    <Text>For {link.balance.lastRelatingPaymentRequest.name}.</Text>
                ) : (
                    <></>
                )}
                {!paid && !shouldPayMoney && <Text>You don't have to pay anymore. You can close this page.</Text>}
            </Skeleton>

            {/* && (!lastPaymentDate || new Date().getTime() - new Date(lastPaymentDate).getTime() > 60 * 1000) */}
            {link?.paymentMethod === "IBAN" && previouslyOpenedAt && (
                <Alert status="warning" rounded="lg" w="xs" flexDir="column" textAlign="center">
                    <Flex>
                        <AlertIcon />
                        <AlertTitle>You already paid?</AlertTitle>
                    </Flex>
                    You already opened this link{previouslyOpenedAt && <> at {previouslyOpenedAt.toLocaleString()}</>}.
                </Alert>
            )}

            <Skeleton isLoaded={!!link}>
                {!paid && shouldPayMoney && (
                    <>
                        {link?.paymentMethod === "MOLLIE" ? (
                            <Button
                                isDisabled={loading || isLoadingLink || paid}
                                isLoading={loading || isLoadingLink}
                                size="lg"
                                w="xs"
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
                                w="xs"
                                colorScheme="green"
                                leftIcon={<FontAwesomeIcon icon={copied ? faClipboardCheck : faClipboard} />}
                                // rightIcon={<FontAwesomeIcon icon={faArrowRight} />}
                                onClick={() => {
                                    if (link && link.paymentMethod === "IBAN") {
                                        void navigator.clipboard.writeText(link.balance.moneyReceiver.iban!);
                                        setCopied(true);
                                    }
                                }}>
                                {!copied ? <>Copy IBAN to clipboard</> : <>Copied!</>}
                            </Button>
                        )}
                    </>
                )}
            </Skeleton>

            <Skeleton isLoaded={!!link}>
                <Text style={{ opacity: "0.5", maxWidth: "500px", textAlign: "center", minHeight: "2rem" }} textAlign="center">
                    {shouldPayMoney && (
                        <>
                            {link?.paymentMethod === "MOLLIE" ? (
                                <>
                                    {getUserDisplayName(link.balance.moneyReceiver)} selected{" "}
                                    <Link target="_blank" href="https://mollie.com">
                                        mollie
                                    </Link>{" "}
                                    as their preferred payment method.
                                </>
                            ) : (
                                <>
                                    Open your banking app and send €{link?.amount?.toFixed(2) ?? 0} to{" "}
                                    {link && getUserDisplayName(link.balance.moneyReceiver)} ({link?.balance.moneyReceiver.iban}). This link detects
                                    if you paid or not.
                                    {/* You can close this page if you already paid it, you won&apos;t be notified again. */}
                                </>
                            )}
                        </>
                    )}
                    {link?.user && (
                        <Text as="p">
                            Logged in as{" "}
                            <Avatar size="xs" name={link.user.userName || link.user.email} src={link.user.avatarUrl || undefined}></Avatar>{" "}
                            {getUserDisplayName(link.user)}.{" "}
                            <Button onClick={() => alert("This page is not meant for you, please close it")} variant="link">
                                Not you?
                            </Button>
                        </Text>
                    )}
                </Text>
            </Skeleton>
        </Center>
    );
}
