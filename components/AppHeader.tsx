import { Flex, Text, IconButton, Heading, Box, Grid, Link } from "@chakra-ui/react";
import { faArrowLeft, faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRouter } from "next/navigation";
import { LogOutButton } from "./LogOutButton";
import { Courgette } from "next/font/google";
import NextLink from "next/link";

const courgette = Courgette({ subsets: ["latin"], weight: "400" });

export function AppText() {
    return (
        <Heading style={courgette.style} className={courgette.className} fontWeight="semibold" alignSelf="center" textAlign="center" as="h1">
            Pay Up!
        </Heading>
    );
}

export function AppFooter() {
    return (
        <Text opacity={0.5} my={2}>
            <Text as="span" style={courgette.style} className={courgette.className}>
                Pay Up!
            </Text>{" "}
            by{" "}
            <Link as={NextLink} href="https://weboot.nl">
                weboot
            </Link>{" "}
            <Link as={NextLink} href="https://github.com/CodeStix/payup">
                <FontAwesomeIcon icon={faGithub} />
            </Link>
        </Text>
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
