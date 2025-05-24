import { createContext } from "react";

export const AuthContext = createContext<{
  token: string | null;
  setToken: (token: string | null) => void;
  resetAuth: () => void;
}>({
  token: null,
  setToken: () => {},
  resetAuth: () => {},
});
