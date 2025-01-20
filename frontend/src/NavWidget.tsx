import React from "react";
import { useNavigate } from 'react-router-dom';

interface Props {
  contents?: string;
}

const NavWidget: React.FC<Props> = ({contents}: Props) => {
  const navigate = useNavigate();

  const handleSearchTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const searchText = event.target.value;
    if (!searchText) {
      navigate("/");
      return;
    }
    try {
      new URL(searchText);
      navigate("/show/" + encodeURIComponent(searchText));
    } catch (_) {
      navigate("/search?q=" + encodeURIComponent(searchText));
    }
  };

  return (
    <div id="searchbar">
      <input id="url" type="text" value={contents} onChange={handleSearchTextChange} autoFocus />
      <div id="navlinks">
        <a id="recentlink" href="/recent">Recent</a>
        <a id="favoritelink" href="/favorite">Favorites</a>
      </div>
    </div>
  )
};

export default NavWidget;
