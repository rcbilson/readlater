// A react component that has an editable text area for a recipe url
// next to a button with a refresh icon. When the button is clicked,
// the recipe url is fetched and the text area below the url is updated
// with the recipe contents.
import React from "react";
import { useNavigate } from 'react-router-dom';
import axios from "axios";
import { useQuery } from '@tanstack/react-query'

import NavWidget from "./NavWidget.tsx";

type Recent = {
  title: string;
  url: string;
}

const RecentPage: React.FC = () => {
  const navigate = useNavigate();

  const fetchQuery = (queryPath: string) => {
    return async () => {
      console.log("fetching " + queryPath);
      const response = await axios.get<Array<Recent>>(queryPath);
      return response.data;
    };
  };

  const {isError, data, error} = useQuery({
    queryKey: ['recents'],
    queryFn: fetchQuery("/api/recents?count=10"),
  });
  const recents = data;

  const handleRecentClick = (url: string) => {
    return () => {
      navigate("/show/" + encodeURIComponent(url));
    }
  }

  if (isError) {
    return <div>An error occurred: {error.message}</div>
  }

  return (
    <div id="recentContainer">
      <NavWidget/>
      {recents &&
        <div>
          <div id="heading">Recently viewed:</div>
          <div id="recentList">
            {recents.map((recent) =>
              <div className="recipeEntry" key={recent.url} onClick={handleRecentClick(recent.url)}>
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
