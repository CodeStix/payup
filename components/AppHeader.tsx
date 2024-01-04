import { Flex, IconButton, Heading, Box, Grid } from "@chakra-ui/react";
import { faArrowLeft, faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRouter } from "next/navigation";
import { LogOutButton } from "./LogOutButton";
import { Courgette } from "next/font/google";

const courgette = Courgette({ subsets: ["latin"], weight: "400" });

export function AppText() {
    return (
        <Heading style={courgette.style} className={courgette.className} fontWeight="semibold" alignSelf="center" textAlign="center" as="h1">
            Pay Up!
        </Heading>
    );
}

export function AppHeader(props: { backButton?: boolean }) {
    const router = useRouter();
    return (
        <Grid templateColumns="1fr auto 1fr" alignItems={"center"}>
            <Flex alignItems="center">
                {props.backButton && (
                    <IconButton
                        colorScheme="orange"
                        variant="ghost"
                        onClick={() => router.back()}
                        display={"inline-block"}
                        icon={<FontAwesomeIcon icon={faArrowLeft} />}
                        aria-label={"go back"}
                    />
                )}
            </Flex>
            <AppText />
            <Flex alignItems="center" justifyContent="end">
                <LogOutButton small />
            </Flex>
        </Grid>
    );
}
