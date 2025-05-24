"use client"

import { ChakraProvider, defaultSystem } from "@chakra-ui/react"
import {
  ColorModeProvider,
  type ColorModeProviderProps,
} from "./color-mode"
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthContext } from './auth-context';
import { useState } from 'react';
import Cookies from "js-cookie";

export function Provider(props: ColorModeProviderProps) {
  const [token, setToken] = useState<string | null>(null);
  // Replace with your Google Client ID
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  const resetAuth = () => {
    Cookies.remove("auth_token");
    setToken(null);
  }
  
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <AuthContext.Provider value={{ token, setToken, resetAuth }}>
        <ChakraProvider value={defaultSystem}>
          <ColorModeProvider {...props} />
        </ChakraProvider>
      </AuthContext.Provider>
    </GoogleOAuthProvider>
  )
}
