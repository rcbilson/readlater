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
  const [token, setTokenState] = useState<string | null>(null);
  // Replace with your Google Client ID
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  // Wrapper that persists token to cookie when set
  const setToken = (newToken: string | null) => {
    if (newToken) {
      Cookies.set("auth_token", newToken, { sameSite: 'Strict', secure: true });
    } else {
      Cookies.remove("auth_token");
    }
    setTokenState(newToken);
  };

  const resetAuth = () => {
    Cookies.remove("auth_token");
    setTokenState(null);
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
