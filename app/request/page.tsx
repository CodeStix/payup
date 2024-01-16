"use client";

import useSWR from "swr";
import {
    Button,
    Text,
    Center,
    Heading,
    Skeleton,
    Flex,
    Card,
    CardBody,
    CardFooter,
    CardHeader,
    Divider,
    Box,
    AvatarGroup,
    Avatar,
    Spacer,
    AvatarBadge,
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalOverlay,
    FormControl,
    FormErrorMessage,
    FormHelperText,
    FormLabel,
    Input,
    useDisclosure,
    Switch,
    Tooltip,
    Badge,
} from "@chakra-ui/react";
import type { PaymentRequest, User } from "@prisma/client";
import { faArrowRight, faCheck, faMoneyBill, faPlus, faTimes, faUserCog } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { signIn, signOut, useSession } from "next-auth/react";
import { fetcher, getUserDisplayName } from "@/util";
import { useRouter } from "next/navigation";
import { LogOutButton } from "@/components/LogOutButton";
import { AppHeader } from "@/components/AppHeader";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PaymentMethodModal } from "@/components/PaymentMethodModal";

function UserSettingsModal(props: { isOpen: boolean; onClose: () => void }) {
    const { data: user, isLoading: isLoadingUser } = useSWR<User>("/api/user", fetcher);
    const [allowOtherUserManualTranser, setAllowOtherUserManualTranser] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const { isOpen: paymentMethodIsOpen, onOpen: paymentMethodOnOpen, onClose: paymentMethodOnClose } = useDisclosure();

    useEffect(() => {
        if (typeof user?.allowOtherUserManualTranser === "boolean") {
            setAllowOtherUserManualTranser(user.allowOtherUserManualTranser);
        }
    }, [user?.allowOtherUserManualTranser]);

    async function saveChanges() {
        setSaving(true);
        setErrors({});
        try {
            const res = await fetch("/api/user", {
                method: "PATCH",
                body: JSON.stringify({
                    allowOtherUserManualTranser,
                }),
            });
            if (res.ok) {
                props.onClose();
            } else {
                setErrors(await res.json());
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <Modal isOpen={props.isOpen} onClose={props.onClose}>
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>Settings</ModalHeader>
                    <ModalCloseButton />
                    <form
                        onSubmit={(ev) => {
                            ev.preventDefault();
                            void saveChanges();
                        }}>
                        <ModalBody display="flex" flexDir="column" gap={4}>
                            <Button
                                colorScheme="blue"
                                size="lg"
                                // leftIcon={<FontAwesomeIcon icon={faMoneyBill} />}
                                rightIcon={<FontAwesomeIcon icon={faArrowRight} />}
                                onClick={() => paymentMethodOnOpen()}>
                                Set up payment method
                            </Button>

                            <FormControl isInvalid={"allowOtherUserManualTranser" in errors} isDisabled={saving || isLoadingUser}>
                                <FormLabel>Allow others to manage payments for you</FormLabel>
                                <Switch
                                    isChecked={allowOtherUserManualTranser}
                                    onChange={(ev) => setAllowOtherUserManualTranser(ev.target.checked)}
                                />
                                {"allowOtherUserManualTranser" in errors ? (
                                    <FormErrorMessage>{errors["allowOtherUserManualTranser"]}</FormErrorMessage>
                                ) : (
                                    <FormHelperText>
                                        If true, other people can let Pay Up know that you got paid (if you paid something). Disable it if you don't
                                        thrust your friends.
                                    </FormHelperText>
                                )}
                            </FormControl>
                        </ModalBody>

                        <ModalFooter>
                            <Button type="button" variant="ghost" colorScheme="blue" mr={3} onClick={props.onClose}>
                                Cancel
                            </Button>
                            <Button
                                rightIcon={<FontAwesomeIcon icon={faCheck} />}
                                isLoading={saving}
                                colorScheme="green"
                                isDisabled={saving}
                                type="submit"
                                variant="solid">
                                Save changes
                            </Button>
                        </ModalFooter>
                    </form>
                </ModalContent>
            </Modal>
            <PaymentMethodModal isOpen={paymentMethodIsOpen} onClose={paymentMethodOnClose} />
        </>
    );
}

export default function HomePage() {
    const router = useRouter();
    const { status: status } = useSession();
    const { data, isLoading } = useSWR<{
        requests: (PaymentRequest & { paidBy: User } & { usersToPay: { user: User; payedAmount: number; partsOfAmount: number }[] })[];
    }>("/api/request", fetcher);
    const { data: user, isLoading: isLoadingUser, mutate: mutateUser } = useSWR<User>("/api/user", fetcher);
    const [loading, setLoading] = useState(false);
    const { isOpen: userSettingsIsOpen, onOpen: userSettingsOnOpen, onClose: userSettingsOnClose } = useDisclosure();

    async function createNew() {
        setLoading(true);
        try {
            const res = await fetch("/api/request", {
                method: "POST",
                body: JSON.stringify({ name: "New request" }),
            });
            if (res.ok) {
                const req: { request: PaymentRequest } = await res.json();
                router.push(`/request/${req.request.id}`);
            } else {
                console.error(await res.text());
            }
        } catch (ex) {
            setLoading(false);
            throw ex;
        }
    }

    useEffect(() => {
        if (status === "unauthenticated") {
            router.replace("/");
        }
    }, [status]);

    return (
        <Flex style={{ height: "100%", justifyContent: "center" }}>
            <Flex style={{ flexDirection: "column", gap: "1rem", padding: "1rem", width: "400px" }}>
                <AppHeader />

                <Divider />

                <Skeleton isLoaded={!isLoading && !isLoadingUser} minHeight={"4rem"}>
                    <Flex flexDir="column" gap="1rem">
                        <Button
                            isLoading={loading}
                            isDisabled={loading}
                            onClick={createNew}
                            width="100%"
                            colorScheme="orange"
                            leftIcon={<FontAwesomeIcon icon={faPlus} />}>
                            Create new payment request
                        </Button>

                        {data?.requests?.map((e) => (
                            <Card
                                key={e.id}
                                // colorScheme="green"
                                background="#eee"
                                shadow="none"
                                border="1px solid transparent"
                                _hover={{ /*transform: "translate(0, -5px)",*/ background: "white", border: "1px solid #eee" }}
                                style={{ transition: "100ms" }}
                                cursor="pointer"
                                onClick={() => router.push(`/request/${e.id}`)}>
                                <CardHeader>
                                    <Flex alignItems="center">
                                        <Box>
                                            <Heading size="md">{e.name}</Heading>
                                            <Text>{getUserDisplayName(e.paidBy)} paid</Text>
                                        </Box>
                                        <Spacer />
                                        <Text fontSize="x-large">€{e.amount.toFixed(2)}</Text>
                                    </Flex>
                                    {!e.published && (
                                        <Badge variant="solid" colorScheme="red">
                                            Not published yet
                                        </Badge>
                                    )}
                                </CardHeader>
                                <CardBody pt={0}>
                                    <Flex alignItems="center" gap={4}>
                                        <Tooltip openDelay={200} label={e.usersToPay.map((e) => getUserDisplayName(e.user)).join(", ")}>
                                            <AvatarGroup size="md" max={5}>
                                                {e.usersToPay.map((u) => {
                                                    return (
                                                        <Avatar
                                                            key={u.user.id}
                                                            name={u.user.userName || u.user.email}
                                                            src={u.user.avatarUrl || undefined}>
                                                            {/* <AvatarBadge boxSize="1.25em" bg={payed ? "green.500" : "red.500"}>
                                                        <FontAwesomeIcon color="white" size="2xs" icon={payed ? faCheck : faTimes} />
                                                    </AvatarBadge> */}
                                                        </Avatar>
                                                    );
                                                })}
                                            </AvatarGroup>
                                        </Tooltip>
                                        <Text>
                                            <FontAwesomeIcon size="xl" icon={faArrowRight} />
                                        </Text>
                                        <Tooltip openDelay={200} label={getUserDisplayName(e.paidBy)}>
                                            <Avatar name={e.paidBy.userName || e.paidBy.email} src={e.paidBy.avatarUrl || undefined}></Avatar>
                                        </Tooltip>
                                    </Flex>
                                </CardBody>
                                {/* <CardFooter>
                                    <Button colorScheme="blue">Edit</Button>
                                </CardFooter> */}
                            </Card>
                        ))}

                        <Button leftIcon={<FontAwesomeIcon icon={faUserCog} />} variant="ghost" colorScheme="blue" onClick={userSettingsOnOpen}>
                            Settings
                        </Button>
                    </Flex>
                </Skeleton>
            </Flex>

            <UserSettingsModal isOpen={userSettingsIsOpen} onClose={userSettingsOnClose} />
        </Flex>
    );
}
