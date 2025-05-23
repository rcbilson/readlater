"use client"

import { ChakraProvider, defaultSystem } from "@chakra-ui/react"
import {
  ColorModeProvider,
  type ColorModeProviderProps,
} from "./color-mode"
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthContext } from './auth-context';
import { useState } from 'react';

export function Provider(props: ColorModeProviderProps) {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  // Replace with your Google Client ID
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <AuthContext.Provider value={{ user, setUser, token, setToken }}>
        <ChakraProvider value={defaultSystem}>
          <ColorModeProvider {...props} />
        </ChakraProvider>
      </AuthContext.Provider>
    </GoogleOAuthProvider>
  )
}
