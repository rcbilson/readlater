// A react component that has an editable text area for a recipe url
// next to a button with a refresh icon. When the button is clicked,
// the recipe url is fetched and the text area below the url is updated
// with the recipe contents.
import React from "react";
import { useNavigate, useLocation } from 'react-router-dom';

import NavWidget from "./NavWidget.tsx";
import RecipeQuery from "./RecipeQuery.tsx";

function useQueryParams() {
  const { search } = useLocation();

  return React.useMemo(() => new URLSearchParams(search), [search]);
}

const SearchPage: React.FC = () => {
  const navigate = useNavigate();
  const query = useQueryParams();

  const search = query.get("q");

  if (!search) {
    navigate("/");
    return;
  }

  return (
    <div id="recentContainer">
      <NavWidget contents={decodeURIComponent(search)} />
      <RecipeQuery queryPath={"/api/search?q=" + search} />
    </div>
  );
};

export default SearchPage;
