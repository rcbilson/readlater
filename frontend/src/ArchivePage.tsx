import React from "react";

import ArticleQuery from "./ArticleQuery.tsx";

const ArchivePage: React.FC = () => {
  return (
    <div id="recentContainer">
      <ArticleQuery queryPath='/api/archive?count=50' />
    </div>
  );
};

export default ArchivePage;
