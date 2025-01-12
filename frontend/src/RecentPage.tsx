// A react component that has an editable text area for a recipe url
// next to a button with a refresh icon. When the button is clicked,
// the recipe url is fetched and the text area below the url is updated
// with the recipe contents.
import React, { useState } from "react";
import { useNavigate } from 'react-router-dom';
import axios from "axios";
import { useQuery } from '@tanstack/react-query'

import SearchBar from "./SearchBar.tsx";

type Recent = {
  title: string;
  url: string;
}

const RecentPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState("");

  const fetchQuery = (queryPath: string) => {
    return async () => {
      console.log("fetching " + queryPath);
      const response = await axios.get<Array<Recent>>(queryPath);
      return response.data;
    };
  };

  const {isPending, isError, data, error} = useQuery({
    queryKey: ['recents', searchText],
    queryFn: fetchQuery(searchText != "" ? "/api/search?q=" + encodeURIComponent(searchText) : "/api/recents?count=10"),
  });
  const recents = data;
  
  const handleButtonClick = (text: string) => {
    setSearchText(text);
    if (!text) return;
    try {
      new URL(text);
      navigate("/show/" + encodeURIComponent(searchText));
    } catch (_) {
    }
  };

  const handleRecentClick = (url: string) => {
    return () => {
      navigate("/show/" + encodeURIComponent(url));
    }
  }

  if (isError) {
    return <div>An error occurred: {error.message}</div>
  }

  let heading = "Recently viewed:";
  if (searchText) {
    heading = "Search results:";
  }

  return (
    <div id="recentContainer">
      <SearchBar isPending={isPending} onSearch={handleButtonClick} />
      {recents &&
        <div>
          <div id="heading">{heading}</div>
          <div id="recentList">
            {recents.map((recent) =>
              <div className="recentEntry" key={recent.url} onClick={handleRecentClick(recent.url)}>
                <div className="title">{recent.title}</div>
                <div className="url">{recent.url}</div>
              </div>
            )}
          </div>
        </div>
      }
    </div>
  );
};

export default RecentPage;
