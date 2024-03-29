"use client";

import { AppHeader } from "@/components/AppHeader";
import { EditableControls } from "@/components/EditableControls";
import { LogOutButton } from "@/components/LogOutButton";
import Mexp from "math-expression-evaluator";
import { fetcher, getUserDisplayName, removeEmailDomain } from "@/util";
import {
    Flex,
    Heading,
    Skeleton,
    Button,
    Editable,
    EditableInput,
    EditablePreview,
    Divider,
    Grid,
    Box,
    Text,
    FormControl,
    FormHelperText,
    FormLabel,
    Input,
    NumberDecrementStepper,
    NumberIncrementStepper,
    NumberInput,
    NumberInputField,
    NumberInputStepper,
    InputGroup,
    InputLeftElement,
    InputLeftAddon,
    List,
    UnorderedList,
    ListItem,
    IconButton,
    Avatar,
    Spacer,
    InputRightElement,
    Popover,
    PopoverArrow,
    PopoverBody,
    PopoverCloseButton,
    PopoverContent,
    PopoverHeader,
    PopoverTrigger,
    PopoverFooter,
    AlertDialog,
    AlertDialogBody,
    AlertDialogContent,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogOverlay,
    useDisclosure,
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalOverlay,
    ButtonGroup,
    Tooltip,
    Alert,
    AlertDescription,
    AlertIcon,
    AlertTitle,
} from "@chakra-ui/react";
import {
    faArrowDown,
    faArrowRight,
    faArrowUp,
    faBan,
    faBullhorn,
    faCheck,
    faCheckCircle,
    faCheckDouble,
    faChevronLeft,
    faCircleMinus,
    faClipboard,
    faClipboardCheck,
    faCoins,
    faCopy,
    faExclamationTriangle,
    faEye,
    faHandHoldingDollar,
    faHandshake,
    faHourglass,
    faLink,
    faMoneyBill,
    faMoneyBill1Wave,
    faMoneyCheck,
    faPen,
    faPlus,
    faQuestion,
    faQuestionCircle,
    faSave,
    faSearch,
    faSubtract,
    faTimes,
    faTrash,
    faUserCheck,
    faUserGraduate,
    faWarning,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { PaymentRequest, PaymentRequestToUser, RelativeUserBalance, User } from "@prisma/client";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import QRCode from "react-qr-code";
import { balanceToMoneyHolderReceiver } from "@/balance";
import { PaymentMethodModal } from "@/components/PaymentMethodModal";

export default function PaymentRequestDetailPage({ params }: { params: { id: string } }) {
    const router = useRouter();
    const { status, data: sessionData } = useSession();
    const [userQuery, setUserQuery] = useState("");
    const [activeUserQuery, setActiveUserQuery] = useState("");
    const [amount, setAmount] = useState<string>("");
    const [isUpdating, setUpdating] = useState(false);
    const { isOpen: isOpenDelete, onOpen: onOpenDelete, onClose: onCloseDelete } = useDisclosure();
    const cancelRef = useRef<HTMLButtonElement>(null);
    const {
        data: request,
        isLoading: requestIsLoading,
        mutate: mutateRequest,
    } = useSWR<PaymentRequest & { usersToPay: { user: User; partsOfAmount: number }[]; paidBy: User }>("/api/request/" + params.id, fetcher);
    const { data: searchResults, isLoading: searchResultsAreLoading } = useSWR<User[]>(
        "/api/user/search?query=" + encodeURIComponent(activeUserQuery),
        fetcher
    );
    const filteredSearchResults = useMemo(
        () => (searchResults && request ? searchResults.filter((e) => !request.usersToPay.some((f) => f.user.id === e.id)) : []),
        [searchResults, request]
    );
    const { isOpen: paymentLinkIsOpen, onOpen: paymentLinkOnOpen, onClose: paymentLinkOnClose } = useDisclosure();
    const { isOpen: manualPaymentIsOpen, onOpen: manualPaymentOnOpen, onClose: manualPaymentOnClose } = useDisclosure();
    const { isOpen: paymentMethodIsOpen, onOpen: paymentMethodOnOpen, onClose: paymentMethodOnClose } = useDisclosure();
    const { isOpen: publishInfoIsOpen, onOpen: publishInfoOnOpen, onClose: publishInfoOnClose } = useDisclosure();
    const [generatedPaymentLink, setGeneratedPaymentLink] = useState("");
    const [manualPaymentMoneyHolder, setManualPaymentMoneyHolder] = useState<User>();
    const amountInputRef = useRef<HTMLInputElement>(null);
    // const [showOpenPaymentLinkButton, setShowOpenPaymentLinkButton] = useState(false);

    const totalParts = useMemo(() => {
        let parts = 0;
        for (let u of request?.usersToPay ?? []) {
            parts += u.partsOfAmount;
        }
        if (parts <= 0) {
            parts = 1;
        }
        return parts;
    }, [request?.usersToPay]);

    useEffect(() => {
        if (request) {
            setAmount(String(request.amount));
        }
    }, [request?.amount]);

    useEffect(() => {
        function updateActiveQuery() {
            setActiveUserQuery(userQuery);
        }

        const i = setTimeout(updateActiveQuery, 500);
        return () => {
            clearTimeout(i);
        };
    }, [userQuery]);

    async function generatePaymentLink(moneyHolderId: number, moneyReceiverId: number) {
        setUpdating(true);
        try {
            const res = await fetch(`/api/pay`, {
                method: "POST",
                body: JSON.stringify({ moneyHolderId, moneyReceiverId }),
            });
            if (!res.ok) {
                console.error(res.status, await res.text());
                throw new Error("Could not generate payment link");
            } else {
                const data = await res.json();
                setGeneratedPaymentLink(data.paymentLink);
                return data.paymentLink;
            }
        } finally {
            setUpdating(false);
        }
    }

    async function patch(n: Partial<PaymentRequest & { usersToPay: { user: { id: number }; userId?: number; partsOfAmount: number }[] }>) {
        setUpdating(true);
        try {
            const res = await fetch(`/api/request/${params.id}`, {
                method: "PATCH",
                body: JSON.stringify(n),
            });
            if (!res.ok) {
                const errorData = await res.json();
                console.error("Could not patch", errorData);
                return errorData;
            }

            // console.log("set", { ...request, ...n });
            await mutateRequest();
            return undefined;
        } finally {
            setUpdating(false);
        }
    }

    async function createNewUser(email: string) {
        const res = await fetch(`/api/user`, {
            method: "POST",
            body: JSON.stringify({
                email: email,
            }),
        });
        if (!res.ok) {
            console.error(res.status, await res.text());
            throw new Error("Could not patch");
        }

        return (await res.json()).user as User;
    }

    async function createNewUserAndBind(email: string) {
        if (!searchResults) {
            console.error("Cannot createNewUserAndBind, not loaded");
            return;
        }

        setUpdating(true);
        try {
            let user = searchResults.find((e) => e.email === email);
            if (!user) {
                user = await createNewUser(email);
            }
            await bindUser(user);
            setUserQuery("");
        } finally {
            setUpdating(false);
        }
    }

    async function bindUser(user: User, partsOfAmount: number = 1) {
        if (!request) {
            console.error("Cannot bindUser, not loaded");
            return;
        }
        setUpdating(true);
        try {
            await patch({
                usersToPay: [
                    ...request.usersToPay.filter((e) => e.user.id !== user.id),
                    { user: user, userId: user.id, partsOfAmount: partsOfAmount },
                ],
            });
        } finally {
            setUpdating(false);
        }
    }

    async function updatePayingUser(userId: number) {
        if (!request) {
            console.error("Cannot updatePayingUser, not loaded");
            return;
        }
        setUpdating(true);
        try {
            await patch({
                paidById: userId,
            });
        } finally {
            setUpdating(false);
        }
    }

    async function unbindUser(user: User) {
        if (!request) {
            console.error("Cannot unbindUser, not loaded");
            return;
        }
        setUpdating(true);
        try {
            await patch({
                usersToPay: request.usersToPay.filter((e) => e.user.id !== user.id),
            });
        } finally {
            setUpdating(false);
        }
    }

    async function updateAmount(amountStr: string) {
        amountStr = amountStr.replaceAll(",", ".");

        let amount;
        try {
            const mexp = new Mexp();
            amount = mexp.eval(amountStr, [], {});
            if (isNaN(amount)) {
                throw true;
            }
        } catch {
            amount = parseFloat(amountStr);
        }

        if (isNaN(amount)) {
            console.error("Invalid amount");
        } else if (amount !== request?.amount) {
            await patch({
                amount: amount,
            });
        }
    }

    async function deletePaymentRequest() {
        if (!request) return;
        setUpdating(true);
        try {
            const res = await fetch(`/api/request/${request.id}`, {
                method: "DELETE",
                body: JSON.stringify({}),
            });
            if (res.ok) {
                router.back();
            } else {
                throw new Error("Could not delete");
            }
        } finally {
            setUpdating(false);
        }
    }

    async function manualPayment(moneyHolderId: number, moneyReceiverId: number, amount: number) {
        setUpdating(true);
        try {
            const res = await fetch("/api/balance", {
                method: "PATCH",
                body: JSON.stringify({
                    amount: amount,
                    moneyHolderId: moneyHolderId,
                    moneyReceiverId: moneyReceiverId,
                }),
            });
            if (res.ok) {
                await mutateRequest();
            } else {
                console.error("Could not add manual payment", await res.text());
            }
        } finally {
            setUpdating(false);
        }
    }

    async function publish() {
        const errors = await patch({ published: true });
        if (errors) {
            if (errors["published"] === "no-payment-method") {
                paymentMethodOnOpen();
            } else {
                console.error("Unknown problem while publishing", errors);
            }
        } else {
            publishInfoOnOpen();
        }
    }

    async function unpublish() {
        await patch({ published: false });
    }

    useEffect(() => {
        if (status === "unauthenticated") {
            router.replace("/");
        }
    }, [status]);

    return (
        <Flex style={{ height: "100%", justifyContent: "center" }}>
            <Flex flexDir="column">
                <Flex style={{ flexDirection: "column", gap: "1rem", padding: "1rem", width: "400px", overflow: "auto" }}>
                    <AppHeader backButton />

                    <Divider />

                    <Skeleton isLoaded={!!request}>
                        <Heading as="h2" fontSize="x-large">
                            <Editable
                                display="flex"
                                alignItems="center"
                                gap={2}
                                flexWrap="nowrap"
                                isDisabled={isUpdating}
                                defaultValue={request?.name}
                                onSubmit={(ev) => {
                                    if (ev !== request?.name) {
                                        void patch({
                                            name: ev,
                                        });
                                    }
                                }}>
                                <EditablePreview />
                                <EditableInput style={{}} />
                                <EditableControls />
                            </Editable>
                        </Heading>
                    </Skeleton>

                    <Skeleton isLoaded={!!request}>
                        <form
                            onSubmit={(ev) => {
                                ev.preventDefault();
                                void updateAmount(amount);
                            }}>
                            <FormControl isDisabled={isUpdating}>
                                <FormLabel>Total amount</FormLabel>
                                <InputGroup>
                                    {/* <InputLeftAddon>€</InputLeftAddon> */}
                                    <InputLeftElement pointerEvents="none" color="gray.300" fontSize="1.2em">
                                        €
                                    </InputLeftElement>

                                    <Input
                                        ref={amountInputRef}
                                        autoFocus
                                        onBlur={(ev) => {
                                            setAmount(ev.target.value);
                                            void updateAmount(ev.target.value);
                                        }}
                                        value={amount}
                                        onChange={(ev) => setAmount(ev.target.value)}
                                        max={100000}
                                        min={1}
                                        type="text"></Input>
                                </InputGroup>
                                {request?.paidBy && (
                                    <FormHelperText>
                                        Paid by{" "}
                                        <Tooltip closeOnClick={false} openDelay={200} label="You can change the payer using the list below.">
                                            {getUserDisplayName(request.paidBy, sessionData?.user)}
                                        </Tooltip>
                                        . This amount will be divided over your friends.
                                    </FormHelperText>
                                )}
                            </FormControl>
                        </form>
                    </Skeleton>

                    <form
                        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
                        onSubmit={(ev) => {
                            // void createNewUserAndBind(userQuery);
                            ev.preventDefault();
                        }}>
                        <Skeleton isLoaded={!!request}>
                            <FormControl isDisabled={isUpdating}>
                                <FormLabel>Who has to Pay Up?</FormLabel>
                                <InputGroup>
                                    <InputLeftElement pointerEvents="none" color="gray.300">
                                        <FontAwesomeIcon icon={faSearch} />
                                    </InputLeftElement>
                                    <Input
                                        onChange={(ev) => setUserQuery(ev.target.value)}
                                        value={userQuery}
                                        placeholder="search or enter email..."></Input>
                                    {userQuery.length > 0 && (
                                        <InputRightElement width="3rem">
                                            <IconButton
                                                icon={<FontAwesomeIcon icon={faTimes} />}
                                                h="1.75rem"
                                                size="sm"
                                                onClick={() => setUserQuery("")}
                                                aria-label={"Clear search query"}></IconButton>
                                        </InputRightElement>
                                    )}
                                </InputGroup>

                                {/* <FormHelperText>
                                You can also enter an email address.
                            </FormHelperText> */}
                            </FormControl>
                        </Skeleton>
                    </form>

                    {userQuery.includes("@") &&
                        !searchResultsAreLoading &&
                        !isUpdating &&
                        (searchResults?.length ?? 0) === 0 &&
                        userQuery === activeUserQuery && (
                            <Button
                                // isDisabled={isUpdating || usersIsLoading || userQuery !== activeUserQuery}
                                onClick={() => void createNewUserAndBind(userQuery)}
                                w="full"
                                size="md"
                                variant={"solid"}
                                colorScheme="green">
                                Add&nbsp;<Box>{userQuery}</Box>
                            </Button>
                        )}
                    <Skeleton isLoaded={request && searchResults && userQuery === activeUserQuery}>
                        <Text as="p" opacity={0.5}>
                            {filteredSearchResults.length === 0
                                ? userQuery
                                    ? "No results"
                                    : ""
                                : userQuery
                                ? "Search results"
                                : "Recommended users"}
                        </Text>

                        <UnorderedList ml={0}>
                            {filteredSearchResults.map((u) => (
                                <ListItem my={1} display="flex" key={u.id} alignItems="center" gap={2}>
                                    <Tooltip label={u.email} openDelay={200}>
                                        <Avatar size="sm" name={u.userName || u.email} src={u.avatarUrl || undefined} />
                                    </Tooltip>

                                    <Tooltip label={u.email} openDelay={200}>
                                        <Text wordBreak="break-word" fontWeight="normal">
                                            {getUserDisplayName(u, sessionData?.user)}{" "}
                                            {/* {u.email === sessionData?.user?.email && (
                                                <Text as="span" opacity={0.5}>
                                                    (you)
                                                </Text>
                                            )} */}
                                        </Text>
                                    </Tooltip>
                                    <Spacer />
                                    {/* <IconButton
                                        isDisabled={isUpdating}
                                        onClick={() => void updatePayingUser(u.id)}
                                        size="sm"
                                        colorScheme="blue"
                                        aria-label="Set as paying user"
                                        icon={<FontAwesomeIcon icon={faCoins} />}></IconButton> */}
                                    <IconButton
                                        isDisabled={isUpdating}
                                        onClick={() => void bindUser(u)}
                                        size="sm"
                                        colorScheme="green"
                                        aria-label="Add user"
                                        icon={<FontAwesomeIcon icon={faPlus} />}></IconButton>
                                </ListItem>
                            ))}
                        </UnorderedList>
                    </Skeleton>

                    {/* {(request?.usersToPay.length ?? 0) > 0 && <Divider />} */}

                    <Skeleton isLoaded={!!request}>
                        <Text as="p" fontWeight="bold" color="red.500">
                            <FontAwesomeIcon icon={faCoins} /> User that paid
                        </Text>

                        <Flex alignItems="center" gap={2} my={1}>
                            {request?.paidBy && (
                                <Tooltip label={request.paidBy.email ?? ""} openDelay={200}>
                                    <Avatar
                                        size="sm"
                                        name={request.paidBy.userName || request.paidBy.email}
                                        src={request.paidBy.avatarUrl ?? undefined}
                                    />
                                </Tooltip>
                            )}

                            {request?.paidBy && (
                                <Tooltip label={request?.paidBy.email} openDelay={200}>
                                    <Text wordBreak="break-word" fontWeight="normal">
                                        {getUserDisplayName(request.paidBy, sessionData?.user)}
                                    </Text>
                                </Tooltip>
                            )}

                            <Spacer />

                            <Button
                                onClick={() => amountInputRef.current?.focus()}
                                variant="link"
                                color="red.500"
                                mx={1}
                                fontWeight="semibold"
                                whiteSpace="nowrap">
                                € {request?.amount?.toFixed(2)}
                            </Button>

                            <Popover>
                                <PopoverTrigger>
                                    <IconButton
                                        isDisabled={isUpdating}
                                        size="sm"
                                        colorScheme="blue"
                                        variant="solid"
                                        aria-label="Set paying user"
                                        icon={<FontAwesomeIcon icon={faPen} />}></IconButton>
                                </PopoverTrigger>
                                <PopoverContent>
                                    <PopoverArrow />
                                    <PopoverCloseButton />
                                    <PopoverHeader fontWeight="semibold">Change paying user</PopoverHeader>
                                    <PopoverBody>
                                        <Text>
                                            You can change the paying user using the list below by clicking the circle next to their name and clicking
                                            'Set as paying user'
                                        </Text>
                                    </PopoverBody>
                                </PopoverContent>
                            </Popover>
                        </Flex>
                    </Skeleton>

                    <Skeleton isLoaded={!!request}>
                        {(request?.usersToPay.length ?? 0) > 0 && (
                            <Text as="p" fontWeight="bold" color="green.500">
                                <FontAwesomeIcon icon={faCoins} /> Paying users
                            </Text>
                        )}
                        <UnorderedList ml={0}>
                            {request?.usersToPay.map((e) => (
                                <PayingUserListItem
                                    request={request}
                                    totalParts={totalParts}
                                    key={e.user.id}
                                    payingUser={e}
                                    isDisabled={isUpdating}
                                    onManualPayment={() => {
                                        setManualPaymentMoneyHolder(e.user);
                                        manualPaymentOnOpen();
                                    }}
                                    onPaymentLink={async (moneyHolderId: number, moneyReceiverId: number, shouldOpen: boolean) => {
                                        const link = await generatePaymentLink(moneyHolderId, moneyReceiverId);
                                        if (shouldOpen) {
                                            window.open(link, "_blank");
                                        } else {
                                            paymentLinkOnOpen();
                                        }
                                    }}
                                    onChangeFraction={(newFraction) => {
                                        void bindUser(e.user, newFraction);
                                    }}
                                    onRemove={() => {
                                        void unbindUser(e.user);
                                    }}
                                    onSetPayingUser={() => {
                                        void updatePayingUser(e.user.id);
                                    }}
                                    onConfirmPayment={(holderId, receiverId, amount) => {
                                        void manualPayment(holderId, receiverId, amount);
                                    }}
                                />
                            ))}
                        </UnorderedList>
                    </Skeleton>

                    <Skeleton isLoaded={!!request}>
                        <Button
                            isLoading={isUpdating}
                            isDisabled={isUpdating || (request?.usersToPay.length ?? 0) < 1}
                            w="full"
                            colorScheme={request?.published ? "red" : "green"}
                            leftIcon={<FontAwesomeIcon icon={request?.published ? faBan : faBullhorn} />}
                            onClick={async () => {
                                if (!request!.published) {
                                    void publish();
                                } else {
                                    void unpublish();
                                }
                            }}>
                            {request?.published ? <>Unpublish</> : <>Save & Publish</>}
                        </Button>
                    </Skeleton>

                    <Skeleton isLoaded={!!request}>
                        <Button
                            isDisabled={isUpdating}
                            w="full"
                            variant="ghost"
                            colorScheme="red"
                            leftIcon={<FontAwesomeIcon icon={faTrash} />}
                            onClick={() => onOpenDelete()}>
                            Delete payment request
                        </Button>
                    </Skeleton>

                    {request?.createdDate && (
                        <Text textAlign="center" opacity={0.5} fontSize="xs" as="p" mt={1}>
                            Created at {new Date(request.createdDate).toLocaleString()}
                        </Text>
                    )}

                    <AlertDialog isOpen={isOpenDelete} leastDestructiveRef={cancelRef} onClose={onCloseDelete}>
                        <AlertDialogOverlay>
                            <AlertDialogContent>
                                <AlertDialogHeader fontSize="lg" fontWeight="bold">
                                    Delete payment request
                                </AlertDialogHeader>

                                <AlertDialogBody>Are you sure? You can&apos;t undo this action afterwards.</AlertDialogBody>

                                <AlertDialogFooter>
                                    <Button ref={cancelRef} onClick={onCloseDelete}>
                                        Cancel
                                    </Button>
                                    <Button
                                        isDisabled={isUpdating}
                                        colorScheme="red"
                                        onClick={async () => {
                                            await deletePaymentRequest();
                                            onCloseDelete();
                                        }}
                                        ml={3}>
                                        Delete
                                    </Button>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialogOverlay>
                    </AlertDialog>
                </Flex>
                <Box mt={"auto"}>
                    {/* <Button size="lg" colorScheme="orange" rightIcon={<FontAwesomeIcon icon={faSave} />} onClick={() => router.back()}>
                        Send it
                    </Button> */}
                </Box>
            </Flex>

            {generatedPaymentLink && (
                <PaymentLinkModal showOpenButton={false} isOpen={paymentLinkIsOpen} onClose={paymentLinkOnClose} paymentLink={generatedPaymentLink} />
            )}
            {manualPaymentMoneyHolder && request?.paidBy && (
                <ManualPaymentModal
                    isOpen={manualPaymentIsOpen}
                    onClose={manualPaymentOnClose}
                    moneyReceiver={request.paidBy}
                    moneyHolder={manualPaymentMoneyHolder}
                    onSubmit={() => {
                        void mutateRequest();
                        manualPaymentOnClose();
                    }}
                />
            )}
            {request && <PublishInfoModal paidByUser={request?.paidBy} isOpen={publishInfoIsOpen} onClose={publishInfoOnClose} />}
            {request && (
                <PaymentMethodModal
                    notOwnUserId={sessionData?.user?.email === request?.paidBy.email ? undefined : request?.paidBy.id}
                    isOpen={paymentMethodIsOpen}
                    onClose={(cancelled) => {
                        paymentMethodOnClose();

                        if (!cancelled) {
                            void publish();
                        }
                    }}
                />
            )}
        </Flex>
    );
}

function PublishInfoModal(props: { isOpen: boolean; onClose: () => void; paidByUser: User }) {
    const { data: sessionData } = useSession();
    return (
        <Modal isOpen={props.isOpen} onClose={props.onClose}>
            <ModalOverlay />
            <ModalContent>
                <ModalHeader color="green.500" fontWeight="semibold">
                    <FontAwesomeIcon icon={faCheckCircle} /> Published
                </ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                    {/* <Text color="green.500" fontWeight="semibold">
                        <FontAwesomeIcon icon={faCheckCircle} /> Your payment request is now published.
                    </Text> */}
                    <Text>
                        Paying users will keep receiving notifications while {getUserDisplayName(props.paidByUser, sessionData?.user)} wait(s). When
                        an user has opened the payment link, {getUserDisplayName(props.paidByUser, sessionData?.user)} will receive a notification a
                        couple of days later, to confirm the payment.
                    </Text>
                </ModalBody>

                <ModalFooter>
                    <Button w="full" colorScheme="green" onClick={props.onClose}>
                        OK
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

function PayingUserListItem(props: {
    request: PaymentRequest & { paidBy: User };
    isDisabled: boolean;
    payingUser: {
        user: User;
        partsOfAmount: number;
    };
    totalParts: number;
    onConfirmPayment: (moneyHolderId: number, moneyReceiverId: number, amount: number) => void;
    onManualPayment: () => void;
    onPaymentLink: (moneyHolderId: number, moneyReceiverId: number, shouldOpen: boolean) => void;
    onChangeFraction: (newFraction: number) => void;
    onRemove: () => void;
    onSetPayingUser: () => void;
}) {
    const e = props.payingUser;
    const { data: sessionData } = useSession();

    return (
        <ListItem my={1} display="flex" key={e.user.id} alignItems="center" gap={2}>
            <Tooltip label={e.user.email} openDelay={200}>
                <Avatar size="sm" name={e.user.userName || e.user.email} src={e.user.avatarUrl || undefined} />
            </Tooltip>

            <Tooltip label={e.user.email} openDelay={200}>
                <Text wordBreak="break-word" fontWeight="normal">
                    {getUserDisplayName(e.user, sessionData?.user)}
                </Text>
            </Tooltip>

            {/* {e.user.email !== sessionData?.user?.email && ( */}
            <PaymentStatusButton
                onConfirmPayment={props.onConfirmPayment}
                onManualPayment={props.onManualPayment}
                onPaymentLink={props.onPaymentLink}
                onSetPayingUser={props.onSetPayingUser}
                isDisabled={props.isDisabled}
                userToPay={e as any}
                request={props.request}
                totalParts={props.totalParts}
            />
            {/* )} */}

            <Spacer />

            <Popover>
                <PopoverTrigger>
                    <Button variant="link" color="green.500" mx={1} fontWeight="semibold" whiteSpace="nowrap">
                        € {((e.partsOfAmount / props.totalParts) * props.request.amount).toFixed(2)}
                    </Button>
                </PopoverTrigger>
                <PopoverContent>
                    <PopoverArrow />
                    <PopoverCloseButton />
                    <PopoverHeader fontWeight="semibold">Fraction of total amount</PopoverHeader>
                    <PopoverBody>
                        <Flex alignItems="center" gap={2}>
                            <IconButton
                                onClick={() => {
                                    props.onChangeFraction(e.partsOfAmount - 1);
                                }}
                                colorScheme="blue"
                                isDisabled={props.isDisabled || e.partsOfAmount <= 1}
                                aria-label="Less fraction of amount"
                                icon={<FontAwesomeIcon icon={faSubtract} />}></IconButton>
                            <Text px={2} as="span">
                                {e.partsOfAmount}
                            </Text>
                            <IconButton
                                isDisabled={props.isDisabled}
                                onClick={() => {
                                    props.onChangeFraction(e.partsOfAmount + 1);
                                }}
                                colorScheme="blue"
                                aria-label="More fraction of amount"
                                icon={<FontAwesomeIcon icon={faPlus} />}></IconButton>
                            {/* <Text whiteSpace={"nowrap"} as="p" opacity={0.5}>
                    parts of {request.amount}.
                </Text> */}
                        </Flex>
                    </PopoverBody>
                </PopoverContent>
            </Popover>

            <IconButton
                isDisabled={props.isDisabled}
                onClick={props.onRemove}
                size="sm"
                colorScheme="red"
                aria-label="Remove user"
                icon={<FontAwesomeIcon icon={faTimes} />}></IconButton>
        </ListItem>
    );
}

function ManualPaymentModal(props: { isOpen: boolean; onClose: () => void; moneyHolder: User; onSubmit: () => void; moneyReceiver: User }) {
    const { data } = useSession();
    const [direction, setDirection] = useState<null | boolean>(null);
    const [amount, setAmount] = useState("0");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<"transfer-not-allowed-user" | null>(null);

    async function submit() {
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch("/api/balance", {
                method: "PATCH",
                body: JSON.stringify({
                    amount: parseFloat(amount),
                    moneyHolderId: direction ? props.moneyHolder.id : props.moneyReceiver.id,
                    moneyReceiverId: direction ? props.moneyReceiver.id : props.moneyHolder.id,
                }),
            });
            if (res.ok) {
                props.onSubmit();
            } else {
                setError("transfer-not-allowed-user");
            }
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Modal isOpen={props.isOpen} onClose={props.onClose}>
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>Add manual payment</ModalHeader>
                <ModalCloseButton />
                <form
                    onSubmit={(ev) => {
                        ev.preventDefault();
                        if (!(parseFloat(amount) >= 0.01)) {
                            return;
                        }
                        void submit();
                    }}>
                    <ModalBody display="flex" flexDir="column" gap={4}>
                        {error === "transfer-not-allowed-user" && (
                            <Alert status="error" rounded="lg" flexDir="column">
                                <Flex>
                                    <AlertIcon />
                                    <AlertTitle>Transfer failed</AlertTitle>
                                </Flex>
                                <AlertDescription textAlign="center">
                                    Only {getUserDisplayName(props.moneyReceiver)} can mark payments as paid according to their settings.
                                </AlertDescription>
                            </Alert>
                        )}

                        <FormControl isDisabled={submitting}>
                            <FormLabel>Select payment direction</FormLabel>
                            <Flex bg="gray.100" p={2} rounded="lg" flexDir="column" alignItems="center" gap={2}>
                                <Text>
                                    <Avatar
                                        mx={1}
                                        size="xs"
                                        name={props.moneyHolder.userName || props.moneyHolder.email}
                                        src={props.moneyHolder.avatarUrl || undefined}
                                    />{" "}
                                    {getUserDisplayName(props.moneyHolder, data?.user)}
                                </Text>
                                <Flex gap={2} alignItems="center">
                                    <Text opacity={direction === true ? 0.5 : 0}>€ {amount}</Text>
                                    <IconButton
                                        aria-label="Send money"
                                        isDisabled={submitting}
                                        type="button"
                                        variant={direction === true ? "outline" : "solid"}
                                        onClick={() => setDirection(true)}
                                        colorScheme="blue"
                                        icon={<FontAwesomeIcon icon={faArrowDown} />}></IconButton>

                                    <IconButton
                                        aria-label="Received money"
                                        isDisabled={submitting}
                                        type="button"
                                        variant={direction === false ? "outline" : "solid"}
                                        onClick={() => setDirection(false)}
                                        colorScheme="blue"
                                        icon={<FontAwesomeIcon icon={faArrowUp} />}></IconButton>
                                    <Text opacity={direction === false ? 0.5 : 0}>€ {amount}</Text>
                                </Flex>
                                <Text>
                                    <Avatar
                                        mx={1}
                                        size="xs"
                                        name={props.moneyReceiver.userName || props.moneyReceiver.email}
                                        src={props.moneyReceiver.avatarUrl || undefined}
                                    />{" "}
                                    {getUserDisplayName(props.moneyReceiver, data?.user)}
                                </Text>
                            </Flex>
                        </FormControl>

                        {direction !== null && (
                            <FormControl isDisabled={submitting}>
                                <FormLabel>Amount</FormLabel>
                                <NumberInput
                                    onBlur={(ev) => {
                                        setAmount(ev.target.value);
                                    }}
                                    autoFocus
                                    value={amount}
                                    onChange={(ev) => setAmount(ev)}
                                    max={100000}
                                    min={1}>
                                    <InputGroup>
                                        <InputLeftAddon>€</InputLeftAddon>
                                        <NumberInputField borderLeftRadius={0} />
                                    </InputGroup>
                                    <NumberInputStepper>
                                        <NumberIncrementStepper />
                                        <NumberDecrementStepper />
                                    </NumberInputStepper>
                                </NumberInput>

                                {/* <FormHelperText>Paid by you. This amount will be divided over your friends.</FormHelperText> */}
                            </FormControl>
                        )}
                    </ModalBody>

                    <ModalFooter>
                        <Button variant="ghost" colorScheme="blue" mr={3} onClick={props.onClose} type="button">
                            Close
                        </Button>
                        <Button
                            isLoading={submitting}
                            leftIcon={<FontAwesomeIcon icon={faCoins} />}
                            isDisabled={submitting || !(parseFloat(amount) >= 0.01)}
                            colorScheme="green"
                            type="submit">
                            Add manual payment
                        </Button>
                    </ModalFooter>
                </form>
            </ModalContent>
        </Modal>
    );
}

function PaymentLinkModal(props: { isOpen: boolean; onClose: () => void; paymentLink: string; showOpenButton: boolean }) {
    const [copied, setCopied] = useState(false);
    return (
        <Modal isOpen={props.isOpen} onClose={props.onClose}>
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>Payment link</ModalHeader>
                <ModalCloseButton />
                <ModalBody display="flex" flexDir="column" gap={4}>
                    {props.showOpenButton && (
                        <Button
                            colorScheme="green"
                            onClick={() => {
                                window.open(props.paymentLink, "_blank");
                                props.onClose();
                            }}
                            rightIcon={<FontAwesomeIcon icon={faArrowRight} />}>
                            Pay now
                        </Button>
                    )}
                    <Button
                        colorScheme="green"
                        onClick={() => {
                            void navigator.clipboard.writeText(props.paymentLink);
                            setCopied(true);
                        }}
                        leftIcon={<FontAwesomeIcon icon={copied ? faClipboardCheck : faClipboard} />}>
                        {copied ? <>Copied!</> : <>Copy link to clipboard</>}
                    </Button>
                    <QRCode
                        size={256}
                        viewBox={`0 0 256 256`}
                        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                        value={props.paymentLink}
                    />
                </ModalBody>

                <ModalFooter>
                    <Button colorScheme="blue" mr={3} onClick={props.onClose}>
                        Close
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

function PaymentStatusButton(props: {
    // paidBy: User;
    userToPay: PaymentRequestToUser & {
        user: User & {
            secondUserBalances?: RelativeUserBalance[];
            firstUserBalances?: RelativeUserBalance[];
            shouldReceiveMoneyFrom: RelativeUserBalance[];
        };
    };
    totalParts: number;
    request: PaymentRequest & { paidBy: User };
    isDisabled: boolean;

    onPaymentLink: (moneyHolderId: number, moneyReceiverId: number, shouldOpen: boolean) => void;
    onConfirmPayment: (moneyHolderId: number, moneyReceiverId: number, amount: number) => void;
    onManualPayment: () => void;
    onSetPayingUser: () => void;
}) {
    const { data: sessionData } = useSession();
    const { amount, lastPaymentDate, moneyHolderId, moneyReceiverId, paymentPageOpenedDate, lastNotificationDate } = balanceToMoneyHolderReceiver(
        props.userToPay.user.firstUserBalances?.[0] ??
            props.userToPay.user.secondUserBalances?.[0] ?? {
                amount: 0,
                firstUserId: props.userToPay.userId,
                secondUserId: props.userToPay.userId,
                paymentPageOpenedDate: null,
                lastNotificationDate: null,
                lastPaymentDate: null,
            }
    );
    const [moneyHolder, moneyReceiver] =
        props.userToPay.userId === moneyHolderId ? [props.userToPay.user, props.request.paidBy] : [props.request.paidBy, props.userToPay.user];
    const even = amount < 0.01;
    const openedPaymentPage = !!paymentPageOpenedDate;

    return (
        <Popover>
            <Tooltip
                hasArrow
                placement="right"
                label={
                    even
                        ? `${getUserDisplayName(moneyReceiver, sessionData?.user)} and ${getUserDisplayName(
                              moneyHolder,
                              sessionData?.user
                          )} are even.`
                        : openedPaymentPage
                        ? `${getUserDisplayName(moneyHolder, sessionData?.user)} opened the payment link to send €${amount.toFixed(
                              2
                          )}. ${getUserDisplayName(moneyReceiver, sessionData?.user)} must confirm the payment.`
                        : `${getUserDisplayName(moneyHolder, sessionData?.user)} still owes ${getUserDisplayName(
                              moneyReceiver,
                              sessionData?.user
                          )} €${amount.toFixed(2)}. The payment link hasn't been opened yet.`
                }>
                <Box display="inline-block">
                    <PopoverTrigger>
                        <IconButton
                            colorScheme={
                                !props.request.published ? "gray" : even ? "green" : moneyHolder.email === sessionData?.user?.email ? "red" : "blue"
                            }
                            size="xs"
                            rounded={"full"}
                            variant="solid"
                            aria-label="Payment status"
                            icon={
                                <FontAwesomeIcon
                                    icon={
                                        even
                                            ? faCheck
                                            : openedPaymentPage
                                            ? faEye
                                            : moneyHolder.email === sessionData?.user?.email
                                            ? faWarning
                                            : faHourglass
                                    }
                                />
                            }
                        />
                    </PopoverTrigger>
                </Box>
            </Tooltip>
            <PopoverContent>
                <PopoverArrow />
                <PopoverCloseButton />
                <PopoverHeader fontWeight="semibold">Payment status</PopoverHeader>
                <PopoverBody display="flex" gap={2} flexDir="column">
                    {!props.request.published && (
                        <Alert status="warning" flexDir="column" rounded="lg">
                            <Flex>
                                <AlertIcon />
                                <AlertTitle>Not published yet</AlertTitle>
                            </Flex>
                            <AlertDescription>This is calculated without your request in mind because it hasn't been published yet.</AlertDescription>
                        </Alert>
                    )}

                    {even ? (
                        <Text as="p" color="green.500" fontWeight="semibold">
                            <FontAwesomeIcon icon={faCheckCircle} /> {getUserDisplayName(moneyReceiver, sessionData?.user)} and{" "}
                            {getUserDisplayName(moneyHolder, sessionData?.user)} are even
                        </Text>
                    ) : (
                        <Text as="p" color="yellow.500" fontWeight="semibold">
                            <FontAwesomeIcon icon={faExclamationTriangle} /> {getUserDisplayName(moneyHolder, sessionData?.user)} still ows{" "}
                            {getUserDisplayName(moneyReceiver, sessionData?.user)} €{amount.toFixed(2)}
                        </Text>
                    )}

                    {!even && (
                        <Text as="p" opacity={0.5}>
                            {getUserDisplayName(moneyHolder, sessionData?.user)} will be notified periodically (weekly) if they haven&apos;t paid. You
                            can also share a payment link/pay below.
                        </Text>
                    )}

                    <Divider />

                    {/* paymentPageOpenedDate */}
                    {!even && moneyReceiver.email === sessionData?.user?.email && (
                        <Tooltip
                            placement="top"
                            hasArrow
                            label={`Press this button if you received €${amount.toFixed(2)} from ${getUserDisplayName(
                                moneyHolder,
                                sessionData?.user
                            )}.`}>
                            <Button
                                onClick={() => props.onConfirmPayment(moneyHolderId, moneyReceiverId, amount)}
                                isDisabled={props.isDisabled}
                                colorScheme="green"
                                leftIcon={<FontAwesomeIcon icon={faCheck} />}>
                                Confirm payment
                            </Button>
                        </Tooltip>
                    )}

                    {!even && moneyHolder.email === sessionData?.user?.email ? (
                        <Button
                            isDisabled={props.isDisabled}
                            onClick={() => props.onPaymentLink(moneyHolder.id, moneyReceiver.id, true)}
                            colorScheme="green"
                            rightIcon={<FontAwesomeIcon icon={faArrowRight} />}>
                            Pay back now
                        </Button>
                    ) : !even ? (
                        <Button
                            variant="solid"
                            isDisabled={props.isDisabled}
                            onClick={() => props.onPaymentLink(moneyHolder.id, moneyReceiver.id, false)}
                            colorScheme="blue"
                            // size="sm"
                            leftIcon={<FontAwesomeIcon icon={faLink} />}>
                            Show payment link
                        </Button>
                    ) : (
                        <></>
                    )}

                    {moneyReceiver.id !== moneyHolder.id && (
                        <Tooltip placement="top" hasArrow label={"Click this button if this user paid for everyone."}>
                            <Button
                                isDisabled={props.isDisabled}
                                variant="outline"
                                onClick={props.onSetPayingUser}
                                colorScheme="blue"
                                // size="sm"
                                leftIcon={<FontAwesomeIcon icon={faUserGraduate} />}>
                                Set as paying user
                            </Button>
                        </Tooltip>
                    )}

                    {moneyHolder.id !== moneyReceiver.id && (
                        <Button
                            isDisabled={props.isDisabled}
                            variant="ghost"
                            onClick={props.onManualPayment}
                            colorScheme="blue"
                            size="sm"
                            leftIcon={<FontAwesomeIcon icon={faHandHoldingDollar} />}>
                            Add manual payment
                        </Button>
                    )}
                </PopoverBody>
                <PopoverFooter>
                    {lastPaymentDate && (
                        <Text as="p" opacity={0.5} fontSize="xs">
                            <>
                                Last payment at{" "}
                                <Text fontWeight="normal" as="span">
                                    {new Date(lastPaymentDate).toLocaleString()}
                                </Text>
                            </>
                        </Text>
                    )}

                    {!even && (
                        <Text as="p" opacity={0.5} fontSize="xs">
                            {openedPaymentPage ? (
                                <>
                                    <FontAwesomeIcon icon={faEye} /> The payment link was opened at {new Date(paymentPageOpenedDate).toLocaleString()}
                                    .
                                </>
                            ) : lastNotificationDate ? (
                                <>
                                    Last notification was sent at{" "}
                                    <Text fontWeight="normal" as="span">
                                        {new Date(lastNotificationDate).toLocaleString()}
                                    </Text>
                                </>
                            ) : (
                                <>Notification hasn't been sent yet. It will be sent before the end of the day.</>
                            )}
                        </Text>
                    )}
                </PopoverFooter>
            </PopoverContent>
        </Popover>
    );
}
