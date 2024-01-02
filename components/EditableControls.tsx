import { ButtonGroup, Flex, IconButton, useEditableControls } from "@chakra-ui/react";
import { faCheck, faPen, faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export function EditableControls() {
    const { isEditing, getSubmitButtonProps, getCancelButtonProps, getEditButtonProps } = useEditableControls();

    return isEditing ? (
        <ButtonGroup justifyContent="center" size="md">
            <IconButton colorScheme="green" aria-label="Save changes" icon={<FontAwesomeIcon icon={faCheck} />} {...getSubmitButtonProps()} />
            <IconButton colorScheme="red" aria-label="Cancel changes" icon={<FontAwesomeIcon icon={faTimes} />} {...getCancelButtonProps()} />
        </ButtonGroup>
    ) : (
        <Flex display="inline-block" justifyContent="center">
            <IconButton aria-label="Edit" size="sm" icon={<FontAwesomeIcon icon={faPen} />} {...getEditButtonProps()} />
        </Flex>
    );
}
