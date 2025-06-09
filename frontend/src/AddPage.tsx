import React, { useState, useContext } from "react";
import { Input, Button } from '@chakra-ui/react';
import { Toaster, toaster } from "@/components/ui/toaster"
import { useNavigate } from 'react-router-dom';
import axios from "axios";
import { AuthContext } from "@/components/ui/auth-context";
import { useQueryClient } from '@tanstack/react-query';
import { ArticleRequest } from './Article';

const AddPage: React.FC = () => {
    const [url, setUrl] = useState("");
    const navigate = useNavigate();
    const { token } = useContext(AuthContext);
    const queryClient = useQueryClient();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            new URL(url);
            const request: ArticleRequest = { url: url };
            await axios.post("/api/summarize", request, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
            toaster.create({
                title: "Recipe added successfully!",
                type: "success",
            });
            queryClient.invalidateQueries({ queryKey: ['articleList'] })
            navigate("/recent", { replace: true });
        } catch (e) {
            toaster.create({
                title: "Invalid URL",
                description: e instanceof Error ? e.message : undefined,
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
