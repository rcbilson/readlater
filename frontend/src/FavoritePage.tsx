import React from "react";

import RecipeQuery from "./RecipeQuery.tsx";

const FavoritePage: React.FC = () => {
  return (
    <div id="recentContainer">
      <RecipeQuery queryPath='/api/favorites?count=10' />
    </div>
  );
};

export default FavoritePage;
