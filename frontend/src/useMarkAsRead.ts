import { useContext } from "react";
import axios from "axios";
import { AuthContext } from "@/components/ui/auth-context";
import { updateOfflineArticleUnreadStatus } from './localDataService';

const useMarkAsRead = () => {
  const { token } = useContext(AuthContext);
  
  return async (url: string) => {
    try {
      await axios.post("/api/markRead", { url }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (error) {
      console.warn("Failed to mark article as read:", error);
    }
    
    // Also update the offline storage if the article is cached
    updateOfflineArticleUnreadStatus(url, false);
  };
};

export { useMarkAsRead };