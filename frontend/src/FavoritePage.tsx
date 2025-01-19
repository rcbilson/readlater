import React from "react";

import NavWidget from "./NavWidget.tsx";
import RecipeQuery from "./RecipeQuery.tsx";

const FavoritePage: React.FC = () => {
  return (
    <div id="recentContainer">
      <NavWidget/>
      <RecipeQuery queryPath='/api/favorites?count=10' />
    </div>
  );
};

export default FavoritePage;
