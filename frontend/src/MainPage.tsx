import { Tabs } from '@chakra-ui/react'
import { LuBookmarkPlus, LuClock, LuSearch, LuWifi, LuWifiOff } from "react-icons/lu"
import { useLocation, Link, useNavigate } from "react-router-dom"
import { useEffect } from "react"

import RecentPage from "./RecentPage"
import SearchPage from "./SearchPage"
import AddPage from "./AddPage"
import { useNetworkStatus } from "./useNetworkStatus"
import { useColorModeValue } from "@/components/ui/color-mode-hooks"

export default function MainPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const isOnline = useNetworkStatus();
  const activeTab = location.pathname.split('/')[1] || 'recent';

  // Color mode aware colors for status indicator
  const onlineBg = useColorModeValue('#e8f5e8', '#2d4a2d');
  const offlineBg = useColorModeValue('#f5f5f5', '#2d2d2d');
  const textColor = useColorModeValue('#000000', '#ffffff');

  // When going offline, redirect non-Recent tabs to Recent
  useEffect(() => {
    if (!isOnline && activeTab !== 'recent') {
      navigate('/recent');
    }
  }, [isOnline, activeTab, navigate]);

  return (
    <Tabs.Root defaultValue="favorites" variant="line"
      value={activeTab} onChange={() => { }}>
      <Tabs.List style={{ position: 'relative' }}>
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

        {/* Online/Offline Status Indicator */}
        <div style={{
          position: 'absolute',
          right: '1em',
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '2em',
          height: '2em',
          borderRadius: '50%',
          background: isOnline ? onlineBg : offlineBg,
          color: textColor
        }}>
          {isOnline ? <LuWifi size={18} /> : <LuWifiOff size={18} />}
        </div>
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
