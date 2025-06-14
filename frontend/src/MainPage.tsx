import { Tabs } from '@chakra-ui/react'
import { LuBookmarkPlus, LuStar, LuClock, LuSearch } from "react-icons/lu"
import { useLocation, Link } from "react-router-dom"

import ArchivePage from "./ArchivePage"
import RecentPage from "./RecentPage"
import SearchPage from "./SearchPage"
import AddPage from "./AddPage"

export default function MainPage() {
  const location = useLocation();
  const activeTab = location.pathname.split('/')[1] || 'recent';

  return (
    <Tabs.Root defaultValue="favorites" variant="line"
      value={activeTab} onChange={() => { }}>
      <Tabs.List>
        <Tabs.Trigger value="recent">
          <LuClock />
          <Link to="/recent">
            Recent
          </Link>
        </Tabs.Trigger>
        <Tabs.Trigger value="archive">
          <LuStar />
          <Link to="/archive">
            Archive
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
      <Tabs.Content value="archive">
        <ArchivePage />
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
  )
}
