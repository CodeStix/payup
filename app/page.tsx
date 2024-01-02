import { Button, Text, Center, Heading } from "@chakra-ui/react";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export default function Home() {
    return (
        <Center style={{ height: "100%", flexDirection: "column", gap: "1em" }}>
            <Heading as="h1">Pay Up!</Heading>
            <Button size="lg" colorScheme="orange" rightIcon={<FontAwesomeIcon icon={faArrowRight} />}>
                Create Payment Request
            </Button>
            <Text style={{ opacity: "0.5" }}>You'll need to log in using Google to create a payment request.</Text>
        </Center>
    );
}
