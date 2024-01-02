"use client";

import { AppHeader } from "@/components/AppHeader";
import { EditableControls } from "@/components/EditableControls";
import { LogOutButton } from "@/components/LogOutButton";
import { fetcher, removeEmailDomain } from "@/util";
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
} from "@chakra-ui/react";
import {
    faChevronLeft,
    faCoins,
    faMoneyBill,
    faMoneyBill1Wave,
    faPlus,
    faSave,
    faSearch,
    faSubtract,
    faTimes,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { PaymentRequest, User } from "@prisma/client";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

export default function PaymentRequestDetailPage({ params }: { params: { id: string } }) {
    const router = useRouter();
    const { status: status } = useSession();
    const [userQuery, setUserQuery] = useState("");
    const [activeUserQuery, setActiveUserQuery] = useState("");
    const [amount, setAmount] = useState<string>("");
    const [isUpdating, setUpdating] = useState(false);
    const {
        data: request,
        isLoading: requestIsLoading,
        mutate: mutateRequest,
    } = useSWR<PaymentRequest & { usersToPay: { user: User; partsOfAmount: number }[] }>("/api/request/" + params.id, fetcher);
    const { data: searchResults, isLoading: searchResultsAreLoading } = useSWR<User[]>(
        "/api/user/search?query=" + encodeURIComponent(activeUserQuery),
        fetcher
    );
    const filteredSearchResults = useMemo(
        () => (searchResults && request ? searchResults.filter((e) => !request.usersToPay.some((f) => f.user.id === e.id)) : []),
        [searchResults, request]
    );

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

    async function patch(n: Partial<PaymentRequest & { usersToPay: { user: { id: number }; partsOfAmount: number }[] }>) {
        setUpdating(true);
        try {
            const res = await fetch(`/api/request/${params.id}`, {
                method: "PATCH",
                body: JSON.stringify(n),
            });
            if (!res.ok) {
                console.error(res.status, await res.text());
                throw new Error("Could not patch");
            }

            console.log("set", { ...request, ...n });
            await mutateRequest();
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
                usersToPay: [...request.usersToPay.filter((e) => e.user.id !== user.id), { user: user, partsOfAmount: partsOfAmount }],
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
        const amount = parseFloat(amountStr);
        if (isNaN(amount)) {
            console.error("Invalid amount");
        } else if (amount !== request?.amount) {
            console.log(amount, request?.amount);
            await patch({
                amount: amount,
            });
        }
    }

    return (
        <Flex style={{ height: "100%", justifyContent: "center" }}>
            <Flex style={{ flexDirection: "column", gap: "1rem", padding: "1rem", width: "400px" }}>
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
                            <NumberInput
                                onBlur={(ev) => {
                                    setAmount(ev.target.value);
                                    void updateAmount(ev.target.value);
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

                            <FormHelperText>Paid by you. This amount will be divided over your friends.</FormHelperText>
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
                                <InputLeftElement pointerEvents="none" opacity={0.3}>
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
                        {filteredSearchResults.length === 0 ? "No results" : userQuery ? "Search results" : "Recommended users"}
                    </Text>
                    <UnorderedList ml={0}>
                        {filteredSearchResults.map((u) => (
                            <ListItem my={1} display="flex" key={u.id} alignItems="center" gap={2}>
                                <Avatar size="sm" name={u.userName || u.email} src={u.avatarUrl || undefined} />
                                <Text wordBreak="break-word" fontWeight="normal">
                                    {u.userName || removeEmailDomain(u.email)}
                                </Text>
                                <Spacer />
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

                <Divider />

                <Skeleton isLoaded={!!request}>
                    {(request?.usersToPay.length ?? 0) > 0 && (
                        <Text as="p" fontWeight="bold" color="green.500">
                            <FontAwesomeIcon icon={faCoins} /> Paying users
                        </Text>
                    )}
                    <UnorderedList ml={0}>
                        {request?.usersToPay.map((e) => (
                            <ListItem my={1} display="flex" key={e.user.id} alignItems="center" gap={2}>
                                <Avatar size="sm" name={e.user.userName || e.user.email} src={e.user.avatarUrl || undefined} />
                                <Text wordBreak="break-word" fontWeight="normal">
                                    {e.user.userName || removeEmailDomain(e.user.email)}
                                </Text>
                                <Spacer />

                                <Popover>
                                    <PopoverTrigger>
                                        <Button variant="link" color="green.500" mx={1} fontWeight="semibold" whiteSpace="nowrap">
                                            € {((e.partsOfAmount / totalParts) * request.amount).toFixed(2)}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent>
                                        <PopoverArrow />
                                        <PopoverCloseButton />
                                        <PopoverHeader>Fraction of total amount</PopoverHeader>
                                        <PopoverBody>
                                            <Flex alignItems="center" gap={2}>
                                                <IconButton
                                                    onClick={() => {
                                                        void bindUser(e.user, e.partsOfAmount - 1);
                                                    }}
                                                    colorScheme="blue"
                                                    isDisabled={isUpdating || e.partsOfAmount <= 1}
                                                    aria-label="Less fraction of amount"
                                                    icon={<FontAwesomeIcon icon={faSubtract} />}></IconButton>
                                                <Text px={2} as="span">
                                                    {e.partsOfAmount}
                                                </Text>
                                                <IconButton
                                                    isDisabled={isUpdating}
                                                    onClick={() => {
                                                        void bindUser(e.user, e.partsOfAmount + 1);
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
                                    isDisabled={isUpdating}
                                    onClick={() => void unbindUser(e.user)}
                                    size="sm"
                                    colorScheme="red"
                                    aria-label="Remove user"
                                    icon={<FontAwesomeIcon icon={faTimes} />}></IconButton>
                            </ListItem>
                        ))}
                    </UnorderedList>
                </Skeleton>

                <Button mt={"auto"} size="lg" colorScheme="orange" rightIcon={<FontAwesomeIcon icon={faSave} />} onClick={() => router.back()}>
                    Send it
                </Button>

                <LogOutButton />
            </Flex>
        </Flex>
    );
}
