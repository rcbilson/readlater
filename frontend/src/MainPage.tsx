import { Tabs } from '@chakra-ui/react'
import { LuBookmarkPlus, LuClock, LuSearch } from "react-icons/lu"
import { useLocation, Link, useNavigate } from "react-router-dom"
import { useEffect } from "react"

import RecentPage from "./RecentPage"
import SearchPage from "./SearchPage"
import AddPage from "./AddPage"
import { useNetworkStatus } from "./useNetworkStatus"

export default function MainPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const isOnline = useNetworkStatus();
  const activeTab = location.pathname.split('/')[1] || 'recent';

  // When going offline, redirect non-Recent tabs to Recent
  useEffect(() => {
    if (!isOnline && activeTab !== 'recent') {
      navigate('/recent');
    }
  }, [isOnline, activeTab, navigate]);

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
        <Tabs.Trigger value="search" disabled={!isOnline} className={!isOnline ? 'disabled' : ''}>
          <LuSearch />
          {isOnline ? (
            <Link to="/search">
              Search
            </Link>
          ) : (
            <span style={{ color: '#ccc' }}>Search</span>
          )}
        </Tabs.Trigger>
        <Tabs.Trigger value="add" disabled={!isOnline} className={!isOnline ? 'disabled' : ''}>
          <LuBookmarkPlus />
          {isOnline ? (
            <Link to="/add">
              Add
            </Link>
          ) : (
            <span style={{ color: '#ccc' }}>Add</span>
          )}
        </Tabs.Trigger>
      </Tabs.List>
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
