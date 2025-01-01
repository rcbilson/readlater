// A react component that has an editable text area for a recipe url
// next to a button with a refresh icon. When the button is clicked,
// the recipe url is fetched and the text area below the url is updated
// with the recipe contents.
import React, { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useNavigate } from 'react-router-dom';
import axios from "axios";
import { ErrorBoundary } from "react-error-boundary";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

// RecipeRequest is a type consisting of the url of a recipe to fetch.
type RecipeRequest = {
  url: string;
}

// Recipe is a type representing a recipe, with a url, a title, a
// list of ingredients, and a list of steps.
type Recipe = {
  url: string;
  title: string;
  ingredients: string[];
  method: string[];
}

const testRecipe: Recipe = {
  url: "https://www.bbcgoodfood.com/recipes/pancakes",
  title: "Pancakes",
  ingredients: ["flour", "milk", "eggs"],
  method: ["combine ingredients", "cook until done"]
}

const MainPage: React.FC = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const params = useParams();
  const path = params['*'];
  if (!path) throw new Error("could not find * for show");
  const segments = path.split("/");
  //segments.unshift("subscribe");
  //const newpath = "/" + segments.join("/");
 
  const [recipeUrl, setRecipeUrl] = useState(path);
  const [debug, setDebug] = useState(false);

  const handleRecipeUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRecipeUrl(event.target.value);
  };

  const fetchRecipe = async () => {
    try {
      console.log("fetching " + recipeUrl);
      const request : RecipeRequest = { url: recipeUrl };
      //const response = await axios.post<Recipe>("/summarize", request);
      //setRecipe(response.data);
      return testRecipe;
    } catch (error) {
      console.error("Error fetching recipe:", error);
    }
  };

  const {status, data, error} = useQuery({
    queryKey: ['recipe'],
    queryFn: fetchRecipe
  });
  const recipe = data;
  
  const handleButtonClick = async () => {
    if (recipeUrl != path) {
      navigate("/show/" + recipeUrl);
    }
    queryClient.invalidateQueries(['recipe']);
  };

  const buttonText = (recipeUrl == path) ? "Refresh" : "Load";

  // When CTRL-Q is pressed, switch to debug display
  const checkHotkey = useCallback(
    (e: KeyboardEvent) => {
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

  function fallbackRender({ error, resetErrorBoundary }) {
    // Call resetErrorBoundary() to reset the error boundary and retry the render.

    return (
      <div role="alert">
	<p>Something went wrong:</p>
	<pre style={{ color: "red" }}>{error.message}</pre>
      </div>
    );
  }

  return (
    <div id="container">
      <div id="searchbar">
        <input id="url" type="text" value={recipeUrl} onChange={handleRecipeUrlChange} />
        <button onClick={handleButtonClick}>{buttonText}</button>
      </div>
      {debug && recipe && <pre>{JSON.stringify(recipe, null, 2)}</pre>}
      {!debug && recipe && 
	<ErrorBoundary
	  fallbackRender={fallbackRender}
	  onReset={(details) => {
	    // Reset the state of your app so the error doesn't happen again
	  }}
	>
	  <div>
	   <div id="title">{recipe.title}</div>
           <div id="url">{recipe.url}</div>
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
