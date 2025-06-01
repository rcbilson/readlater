import { RequireAuth } from "@/components/ui/RequireAuth";
import { Tabs } from '@chakra-ui/react'
import { LuBookmarkPlus, LuStar, LuClock, LuSearch } from "react-icons/lu"
import { useLocation, Link } from "react-router-dom"

import FavoritePage from "./FavoritePage"
import RecentPage from "./RecentPage"
import SearchPage from "./SearchPage"
import AddPage from "./AddPage"

export default function MainPage() {
  const location = useLocation();
  const activeTab = location.pathname.split('/')[1] || 'recent';

  return (
    <RequireAuth>
        <Tabs.Root defaultValue="favorites" variant="line"
            value={activeTab} onChange={() => {}}>
          <Tabs.List>
            <Tabs.Trigger value="recent">
              <LuClock />
              <Link to="/recent">
                Recent
              </Link>
            </Tabs.Trigger>
            <Tabs.Trigger value="favorites">
              <LuStar />
              <Link to="/favorites">
                Favorites
              </Link>
            </Tabs.Trigger>
            <Tabs.Trigger value="search">
              <LuSearch />
              <Link to="/search">
                Search
              </Link>
            </Tabs.Trigger>
            <Tabs.Trigger value="add">
              <LuBookmarkPlus />
              <Link to="/add">
                Add
              </Link>
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="favorites">
            <FavoritePage />
          </Tabs.Content>
          <Tabs.Content value="recent">
            <RecentPage />
          </Tabs.Content>
          <Tabs.Content value="search">
            <SearchPage />
          </Tabs.Content>
          <Tabs.Content value="add">
            <AddPage />
          </Tabs.Content>
        </Tabs.Root>
    </RequireAuth>
  )
}
