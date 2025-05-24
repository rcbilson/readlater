import { useContext, useEffect } from "react";
import { AuthContext } from "@/components/ui/auth-context";
import { GoogleLogin } from "@react-oauth/google";
import Cookies from "js-cookie";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, setToken } = useContext(AuthContext);

  useEffect(() => {
    const t = Cookies.get("auth_token");
    if (t) {
      setToken(t);
    }
  }, [setToken]);

  if (!token) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 40 }}>
        <h2>Please sign in with Google to continue</h2>
        <GoogleLogin
          onSuccess={credentialResponse => {
            if (credentialResponse.credential) {
              setToken(credentialResponse.credential);
              Cookies.set("auth_token", credentialResponse.credential, { sameSite: 'Strict', secure: true });
            }
          }}
          onError={() => {
            alert('Login Failed');
          }}
        />
      </div>
    );
  }
  return <>{children}</>;
}
