import { createContext } from "react";

export const AuthContext = createContext<{
  user: any;
  token: string | null;
  setUser: (user: any) => void;
  setToken: (token: string | null) => void;
}>({
  user: null,
  token: null,
  setUser: () => {},
  setToken: () => {},
});
