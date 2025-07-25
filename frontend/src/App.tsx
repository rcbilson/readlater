// Supports weights 100-900
//import '@fontsource-variable/outfit';

import { useEffect } from "react";
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { Provider } from "@/components/ui/provider"

import ErrorPage from "./ErrorPage.jsx";
import ShowPage from "./ShowPage.tsx";
import MainPage from "./MainPage.tsx";
import ShareTarget from "./ShareTarget.tsx";
import { syncManager } from "./syncManager";

const router = createBrowserRouter([
  {
    path: "/",
    element: <MainPage />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/recent",
    element: <MainPage />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/add",
    element: <MainPage />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/search",
    element: <MainPage />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/show/:articleUrl",
    element: <ShowPage />
  },
  {
    path: "/share-target",
    element: <ShareTarget />
  }
]);

const queryClient = new QueryClient()

// App initialization component
function AppWithSync() {
  useEffect(() => {
    // Initialize sync manager on app startup
    syncManager.loadInitialData().catch(console.error);
    
    // Cleanup on unmount
    return () => {
      syncManager.destroy();
    };
  }, []);

  return <RouterProvider router={router} />;
}

export default function App() {
  return (
    <Provider>
      <QueryClientProvider client={queryClient}>
        <AppWithSync />
      </QueryClientProvider>
    </Provider>
  )
}
