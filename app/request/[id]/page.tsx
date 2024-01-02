"use client";

import { AppHeader } from "@/components/AppHeader";
import { EditableControls } from "@/components/EditableControls";
import { LogOutButton } from "@/components/LogOutButton";
import { fetcher } from "@/util";
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
} from "@chakra-ui/react";
import { faChevronLeft, faPlus, faSearch, faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { PaymentRequest, User } from "@prisma/client";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import useSWR from "swr";

export default function Home({ params }: { params: { id: string } }) {
    const { status: status } = useSession();
    const [userQuery, setUserQuery] = useState("");
    const [activeUserQuery, setActiveUserQuery] = useState("");
    const [amount, setAmount] = useState<string>("");
    const [isUpdating, setUpdating] = useState(false);
    const { data, isLoading, mutate } = useSWR<PaymentRequest & { usersToPay: { user: User }[] }>("/api/request/" + params.id, fetcher);
    const { data: users, isLoading: usersIsLoading } = useSWR<User[]>("/api/user/search?query=" + encodeURIComponent(activeUserQuery), fetcher);

    useEffect(() => {
        function updateActiveQuery() {
            setActiveUserQuery(userQuery);
        }

        const i = setTimeout(updateActiveQuery, 500);
        return () => {
            clearTimeout(i);
        };
    }, [userQuery]);

    async function patch(n: Partial<PaymentRequest & { usersToPay: { id: number }[] }>) {
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

            await mutate();
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
        if (!users) {
            console.error("Cannot createNewUserAndBind, not loaded");
            return;
        }

        setUpdating(true);
        try {
            let user = users.find((e) => e.email === email);
            if (!user) {
                user = await createNewUser(email);
            }
            await bindUser(user);
            setUserQuery("");
        } finally {
            setUpdating(false);
        }
    }

    async function bindUser(user: User) {
        if (!data) {
            console.error("Cannot bindUser, not loaded");
            return;
        }
        setUpdating(true);
        try {
            await patch({
                usersToPay: [...data.usersToPay.map((e) => e.user), user],
            });
        } finally {
            setUpdating(false);
        }
    }

    async function unbindUser(user: User) {
        if (!data) {
            console.error("Cannot unbindUser, not loaded");
            return;
        }
        setUpdating(true);
        try {
            await patch({
                usersToPay: data.usersToPay.filter((e) => e.user.id !== user.id).map((e) => e.user),
            });
        } finally {
            setUpdating(false);
        }
    }

    return (
        <Flex style={{ height: "100%", justifyContent: "center" }}>
            <Flex style={{ flexDirection: "column", gap: "1rem", padding: "1rem", width: "400px" }}>
                <AppHeader backButton />

                <Divider />

                <Skeleton isLoaded={!!data}>
                    <Heading as="h2">
                        <Editable
                            display="flex"
                            alignItems="center"
                            gap={2}
                            flexWrap="nowrap"
                            isDisabled={isUpdating}
                            defaultValue={data?.name}
                            onSubmit={(ev) => {
                                if (ev !== data?.name) {
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

                <Skeleton isLoaded={!!data}>
                    <FormControl isDisabled={isUpdating}>
                        <FormLabel>Total amount</FormLabel>
                        <NumberInput autoFocus value={amount} onChange={(ev) => setAmount(ev)} max={100000} min={1}>
                            <InputGroup>
                                <InputLeftAddon>€</InputLeftAddon>
                                <NumberInputField borderLeftRadius={0} />
                            </InputGroup>
                            <NumberInputStepper>
                                <NumberIncrementStepper />
                                <NumberDecrementStepper />
                            </NumberInputStepper>
                        </NumberInput>

                        <FormHelperText>This amount will be divided over your friends.</FormHelperText>
                    </FormControl>
                </Skeleton>

                <form
                    style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
                    onSubmit={(ev) => {
                        void createNewUserAndBind(userQuery);
                        ev.preventDefault();
                    }}>
                    <Skeleton isLoaded={!!data}>
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
                                <pre>{JSON.stringify(users, null, 2)}</pre>
                            </FormHelperText> */}
                        </FormControl>
                    </Skeleton>
                </form>

                {userQuery.includes("@") && !usersIsLoading && !isUpdating && (users?.length ?? 0) === 0 && userQuery === activeUserQuery && (
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
                <Skeleton isLoaded={users && userQuery === activeUserQuery}>
                    <Text as="p" opacity={0.5}>
                        {(users?.length ?? 0) === 0 ? "No results" : userQuery ? "Search results" : "Recommended users"}
                    </Text>
                    <UnorderedList ml={0}>
                        {users &&
                            data &&
                            users
                                .filter((e) => !data.usersToPay.some((f) => f.user.id === e.id))
                                .map((u) => (
                                    <ListItem my={1} display="flex" key={u.id} alignItems="center" gap={2}>
                                        <Avatar size="sm" name={u.userName || u.email} src={u.avatarUrl || undefined} />
                                        <Text fontWeight={"semibold"}>{u.userName || u.email}</Text>
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

                <Skeleton isLoaded={!!data}>
                    <UnorderedList ml={0}>
                        {data?.usersToPay.map((e) => (
                            <ListItem my={1} display="flex" key={e.user.id} alignItems="center" gap={2}>
                                <Avatar size="sm" name={e.user.userName || e.user.email} src={e.user.avatarUrl || undefined} />
                                <Text fontWeight={"semibold"}>{e.user.userName || e.user.email}</Text>
                                <Spacer />
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

                {/* <Button size="lg" colorScheme="orange" rightIcon={<FontAwesomeIcon icon={faArrowRight} />} onClick={() => signIn("google")}>
                Create Payment Request
            </Button> */}
                <Skeleton isLoaded={!isLoading} minHeight={"2rem"}>
                    {/* <pre>{JSON.stringify(data, null, 2)}</pre> */}
                    {/* {data?.requests.map((e) => (
                        <p>{e.name}</p>
                    ))} */}
                    {/* {data?.requests.length === 0 && <Button colorScheme="orange">Create first payment request</Button>} */}
                </Skeleton>

                {/* <pre>{JSON.stringify({ data }, null, 2)}</pre> */}

                <LogOutButton />
            </Flex>
        </Flex>
    );
}
