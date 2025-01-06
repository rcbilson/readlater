// A react component that has an editable text area for a recipe url
// next to a button with a refresh icon. When the button is clicked,
// the recipe url is fetched and the text area below the url is updated
// with the recipe contents.
import React from "react";
import { useNavigate } from 'react-router-dom';
import axios from "axios";
import { useQuery } from '@tanstack/react-query'

import SearchBar from "./SearchBar.tsx";

type Recent = {
  title: string;
  url: string;
}

const RecentPage: React.FC = () => {
  const navigate = useNavigate()

  const fetchRecents = async () => {
    console.log("fetching recents");
    const response = await axios.get<Array<Recent>>("/recents?count=5");
    return response.data;
    //return testRecipe;
  };

  const {isPending, isError, data, error} = useQuery({
    queryKey: ['recents'],
    queryFn: fetchRecents,
  });
  const recents = data;
  
  const handleButtonClick = (searchText: string) => {
    if (!searchText) return;
    navigate("/show/" + encodeURIComponent(searchText));
  };

  const handleRecentClick = (url: string) => {
    return () => {
      navigate("/show/" + encodeURIComponent(url));
    }
  }

  if (isError) {
    return <div>An error occurred: {error.message}</div>
  }

  if (recents) {
    return (
      <div id="recentContainer">
        <SearchBar isPending={isPending} onSearch={handleButtonClick} />
        <div id="heading">Recently viewed:</div>
        <div id="recentList">
          {recents.map((recent) =>
            <div key={recent.url} onClick={handleRecentClick(recent.url)}>
              <div className="title">{recent.title}</div>
              <div className="url">{recent.url}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <></>;
};

export default RecentPage;
