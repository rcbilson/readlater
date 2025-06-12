import React, { useState } from "react";
import { Input, Button } from '@chakra-ui/react';
import { Toaster } from "@/components/ui/toaster"
import { useDoAdd } from './useDoAdd';

const AddPage: React.FC = () => {
    const [url, setUrl] = useState("");
    const doAdd = useDoAdd();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        doAdd(url)
    };

    return (
        <>
            <Toaster />
            <form onSubmit={handleSubmit}>
                <Input
                    id="addInput"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Enter article URL"
                    mb={4}
                />
                <Button type="submit">Add Article</Button>
            </form>
        </>
    );
};

export default AddPage;
