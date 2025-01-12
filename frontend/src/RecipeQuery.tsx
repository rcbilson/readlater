// A react component that has an editable text area for a recipe url
// next to a button with a refresh icon. When the button is clicked,
// the recipe url is fetched and the text area below the url is updated
// with the recipe contents.
import React from "react";
import { useNavigate } from 'react-router-dom';
import axios from "axios";
import { useQuery } from '@tanstack/react-query'

type RecipeEntry = {
  title: string;
  url: string;
}

interface Props {
  queryPath: string;
}

const RecipeQuery: React.FC<Props> = ({queryPath}: Props) => {
  const navigate = useNavigate();

  const fetchQuery = (queryPath: string) => {
    return async () => {
      console.log("fetching " + queryPath);
      const response = await axios.get<Array<RecipeEntry>>(queryPath);
      return response.data;
    };
  };

  const {isError, data, error} = useQuery({
    queryKey: ['recipeList', queryPath],
    queryFn: fetchQuery(queryPath),
  });
  const recents = data;

  const handleRecipeClick = (url: string) => {
    return () => {
      navigate("/show/" + encodeURIComponent(url));
    }
  }

  if (isError) {
    return <div>An error occurred: {error.message}</div>
  }

  return (
    <div id="recipeList">
      {recents && recents.map((recent) =>
        <div className="recipeEntry" key={recent.url} onClick={handleRecipeClick(recent.url)}>
          <div className="title">{recent.title}</div>
          <div className="url">{recent.url}</div>
        </div>
      )}
    </div>
  );
};

export default RecipeQuery;
