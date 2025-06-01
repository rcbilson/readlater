// A react component that has an editable text area for a recipe url
// next to a button with a refresh icon. When the button is clicked,
// the recipe url is fetched and the text area below the url is updated
// with the recipe contents.
import React, { useContext } from "react";
import { useNavigate } from 'react-router-dom';
import axios, { AxiosError } from "axios";
import { useQuery } from '@tanstack/react-query'
import { AuthContext } from "@/components/ui/auth-context";

type RecipeEntry = {
  title: string;
  url: string;
  hasSummary: boolean;
}

interface Props {
  queryPath: string;
}

const RecipeQuery: React.FC<Props> = ({queryPath}: Props) => {
  const navigate = useNavigate();
  const { token, resetAuth } = useContext(AuthContext);

  const fetchQuery = (queryPath: string) => {
    return async () => {
      try {
        console.log("fetching " + queryPath);
        const response = await axios.get<Array<RecipeEntry>>(queryPath, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        return response.data;
      } catch (error) {
        if (error instanceof AxiosError && error.response?.status === 401) {
          resetAuth();
        } else {
          throw error;
        }
      }
    };
  };

  const {isError, data, error} = useQuery({
    queryKey: ['recipeList', queryPath],
    queryFn: fetchQuery(queryPath),
  });
  const recents = data;

  const handleRecipeClick = (entry: RecipeEntry) => {
    return () => {
      const encodedUrl = encodeURIComponent(entry.url);
      axios.post("/api/hit?url=" + encodedUrl, null, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (entry.hasSummary) {
        navigate("/show/" + encodedUrl);
      } else {
        window.open(entry.url, "_blank");
      }
    }
  }

  if (isError) {
    return <div>An error occurred: {error.message}</div>
  }

  return (
    <div id="recipeList">
      {recents && recents.map((recent) =>
        <div className="recipeEntry" key={recent.url} onClick={handleRecipeClick(recent)}>
          <div className="title">{recent.title}</div>
          <div className="url">{new URL(recent.url).hostname}</div>
        </div>
      )}
    </div>
  );
};

export default RecipeQuery;
