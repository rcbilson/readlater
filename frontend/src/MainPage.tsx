import { RequireAuth } from "@/components/ui/RequireAuth";
import { Tabs } from '@chakra-ui/react'
import { LuBookmarkPlus, LuStar, LuClock, LuSearch } from "react-icons/lu"

import FavoritePage from "./FavoritePage"
import RecentPage from "./RecentPage"
import SearchPage from "./SearchPage"
import AddPage from "./AddPage"

export default function MainPage() {
  return (
    <RequireAuth>
        <Tabs.Root defaultValue="favorites" variant="line">
          <Tabs.List>
            <Tabs.Trigger value="favorites">
              <LuStar />
              Favorites
            </Tabs.Trigger>
            <Tabs.Trigger value="recent">
              <LuClock />
              Recent
            </Tabs.Trigger>
            <Tabs.Trigger value="search">
              <LuSearch />
              Search
            </Tabs.Trigger>
            <Tabs.Trigger value="add">
              <LuBookmarkPlus />
              Add
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
