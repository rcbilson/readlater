import React, { useState } from "react";
import { Input } from '@chakra-ui/react';

import RecipeQuery from "./RecipeQuery.tsx";

const SearchPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div>
      <Input
        placeholder="Search bookmarks..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        mb={4}
      />
      {searchQuery && <RecipeQuery queryPath={"/api/search?q=" + encodeURIComponent(searchQuery)} />}
    </div>
  );
};

export default SearchPage;