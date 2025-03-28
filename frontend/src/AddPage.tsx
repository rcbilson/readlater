import React, { useState } from "react";
import { Input, Button } from '@chakra-ui/react';
import { Toaster, toaster } from "@/components/ui/toaster"
import { useNavigate } from 'react-router-dom';

const AddPage: React.FC = () => {
    const [url, setUrl] = useState("");
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            new URL(url);
            navigate("/show/" + encodeURIComponent(url));
        } catch (e) {
            toaster.create({
                title: "Invalid URL",
                type: "error",
            });
            return;
        }
    };

    return (
        <>
            <Toaster />
            <form onSubmit={handleSubmit}>
                <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Enter URL to bookmark"
                    mb={4}
                />
                <Button type="submit">Add Bookmark</Button>
            </form>
        </>
    );
};

export default AddPage;
