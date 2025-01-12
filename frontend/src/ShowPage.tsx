// A react component that has an editable text area for a recipe url
// next to a button with a refresh icon. When the button is clicked,
// the recipe url is fetched and the text area below the url is updated
// with the recipe contents.
import React, { useState, useCallback, useEffect } from "react";
import { useParams } from 'react-router-dom';
import axios from "axios";
import { useQuery } from '@tanstack/react-query'
import { ErrorBoundary } from "react-error-boundary";

import NavWidget from "./NavWidget.tsx";

// RecipeRequest is a type consisting of the url of a recipe to fetch.
type RecipeRequest = {
  url: string;
}

// Recipe is a type representing a recipe, with a url, a title, a
// list of ingredients, and a list of steps.
type Recipe = {
  title: string;
  ingredients: string[];
  method: string[];
}

/*
const testRecipe: Recipe = {
  title: "Pancakes",
  ingredients: ["flour", "milk", "eggs"],
  method: ["combine ingredients", "cook until done"]
}
*/

const MainPage: React.FC = () => {
  const { recipeUrl } = useParams();
 
  const [debug, setDebug] = useState(false);

  const fetchRecipe = async () => {
    if (!recipeUrl) return "";

    console.log("fetching " + recipeUrl);
    const request : RecipeRequest = { url: recipeUrl };
    const response = await axios.post<Recipe>("/api/summarize", request);
    return response.data;
    //return testRecipe;
  };

  const {isError, data, error} = useQuery({
    queryKey: ['recipe', recipeUrl],
    queryFn: fetchRecipe,
    refetchOnWindowFocus: false,
  });
  const recipe = data;

  // When CTRL-Q is pressed, switch to debug display
  const checkHotkey = useCallback(
    (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "q") {
	setDebug(!debug);
      }
    },
    [debug],
  );

  useEffect(() => {
    document.addEventListener('keydown', checkHotkey);

    return () => {
      document.removeEventListener('keydown', checkHotkey);
    };
  }, [checkHotkey]);

  return (
    <div id="container">
      <NavWidget contents={recipeUrl} />
      {isError && <div>An error occurred: {error.message}</div>}
      {debug && recipe && <pre>{JSON.stringify(recipe, null, 2)}</pre>}
      {!debug && recipe && 
	<ErrorBoundary fallback={<div>That didn't work. Maybe try refreshing?</div>}>
          <div>
           <div id="title">{recipe.title}</div>
           <div id="method">
             {recipe.ingredients && <ul>{recipe.ingredients.map((ingredient, id) => <li key={id}>{ingredient}</li>)}</ul>}
             {recipe.method && <ol>{recipe.method.map((step, id) => <li key={id}>{step}</li>)}</ol>}
           </div>
          </div>
        </ErrorBoundary>
      }
    </div>
  );
};

export default MainPage;
