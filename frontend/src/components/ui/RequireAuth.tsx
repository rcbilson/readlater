import { useContext } from "react";
import { AuthContext } from "@/components/ui/auth-context";
import { GoogleLogin } from "@react-oauth/google";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, setUser, setToken } = useContext(AuthContext);

  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 40 }}>
        <h2>Please sign in with Google to continue</h2>
        <GoogleLogin
          onSuccess={credentialResponse => {
            setToken(credentialResponse.credential || null);
            // Optionally decode the JWT to get user info
            const base64Url = credentialResponse.credential?.split('.')[1];
            if (base64Url) {
              const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
              const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
              }).join(''));
              setUser(JSON.parse(jsonPayload));
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
