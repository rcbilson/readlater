// A react component that has an editable text area for a recipe url
// next to a button with a refresh icon. When the button is clicked,
// the recipe url is fetched and the text area below the url is updated
// with the recipe contents.
import React from "react";
import { useNavigate, useLocation } from 'react-router-dom';
import axios from "axios";
import { useQuery } from '@tanstack/react-query'

import SearchBar from "./SearchBar.tsx";

type RecipeEntry = {
  title: string;
  url: string;
}

function useQueryParams() {
  const { search } = useLocation();

  return React.useMemo(() => new URLSearchParams(search), [search]);
}

const SearchPage: React.FC = () => {
  const navigate = useNavigate();
  const query = useQueryParams();

  const search = query.get("q");

  const fetchQuery = (search: string|null) => {
    return async () => {
      if (!search) {
        return null;
      }
      const queryPath = "/api/search?q=" + search;
      console.log("fetching " + queryPath)
      const response = await axios.get<Array<RecipeEntry>>(queryPath);
      return response.data;
    };
  };

  const {isPending, isError, data, error} = useQuery({
    queryKey: ['recents', search],
    queryFn: fetchQuery(search),
  });
  const recents = data;

  if (!search) {
    navigate("/");
    return;
  }
  
  const handleButtonClick = (searchText: string) => {
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

  const handleRecipeEntryClick = (url: string) => {
    return () => {
      navigate("/show/" + encodeURIComponent(url));
    }
  }

  if (isError) {
    return <div>An error occurred: {error.message}</div>
  }

  return (
    <div id="recentContainer">
      <SearchBar contents={decodeURIComponent(search)} isPending={isPending} onSearch={handleButtonClick} />
      {recents &&
        <div>
          <div id="heading">Search results:</div>
          <div id="recentList">
            {recents.map((recent) =>
              <div className="recipeEntry" key={recent.url} onClick={handleRecipeEntryClick(recent.url)}>
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

export default SearchPage;
