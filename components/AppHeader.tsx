import { Flex, IconButton, Heading, Box, Grid } from "@chakra-ui/react";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRouter } from "next/navigation";
import { LogOutButton } from "./LogOutButton";

export function AppHeader(props: { backButton?: boolean }) {
    const router = useRouter();
    return (
        <Grid templateColumns="1fr auto 1fr" alignItems={"center"}>
            <Flex alignItems="center">
                {props.backButton && (
                    <IconButton
                        onClick={() => router.back()}
                        display={"inline-block"}
                        icon={<FontAwesomeIcon icon={faChevronLeft} />}
                        aria-label={"go back"}
                    />
                )}
            </Flex>
            <Heading fontWeight="semibold" alignSelf="center" textAlign="center" as="h1">
                Pay Up!
            </Heading>
            <Flex alignItems="center" justifyContent="end">
                {/* <LogOutButton small /> */}
            </Flex>
        </Grid>
    );
}
