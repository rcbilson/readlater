// A react component that has an editable text area for a recipe url
// next to a button with a refresh icon. When the button is clicked,
// the recipe url is fetched and the text area below the url is updated
// with the recipe contents.
import React, { useState, useCallback, useEffect, useContext } from "react";
import { useParams } from 'react-router-dom';
import axios, { AxiosError } from "axios";
import { useQuery } from '@tanstack/react-query'
import { ErrorBoundary } from "react-error-boundary";
import { List } from "@chakra-ui/react"
import { AuthContext } from "@/components/ui/auth-context";

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
  const { token, resetAuth } = useContext(AuthContext);

  if (!recipeUrl) {
    return <div>Oops, no recipe here!</div>;
  }
 
  const [debug, setDebug] = useState(false);

  const fetchRecipe = async () => {
    try {
      console.log("fetching " + recipeUrl);
      const request: RecipeRequest = { url: recipeUrl };
      const response = await axios.post<Recipe>("/api/summarize", request, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return response.data;
      //return testRecipe;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 401) {
        resetAuth();
      } else {
        throw error;
      }
    }
  };

  const {isPending, isError, data, error} = useQuery({
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

  useEffect(() => {
    if (recipe && recipe.title) {
      document.title = "Recipes: " + recipe.title;
    } else {
      document.title = "Recipes";
    }
  }, [recipe]);
  
  const handleLinkClick = () => {
    return () => {
      navigator.clipboard.writeText(document.location.href);
    }
  }

  const handleIngredientClick = (recipe: Recipe) => {
    return () => {
      const ingredients = recipe.ingredients.join("\n");
      navigator.clipboard.writeText(ingredients);
    }
  }

  const recipeLink = <a href={recipeUrl}>{recipeUrl}</a>;

  return (
    <div id="recipeContainer">
      {isError && <div>An error occurred: {error.message}</div>}
      {isPending && <div>We're loading a summary of this recipe, just a moment...</div>}
      {!isPending && !recipe && <div>We don't have a summary for {recipeLink}. You can see the original by clicking the link.</div>}
      {debug && recipe && <pre>{JSON.stringify(recipe, null, 2)}</pre>}
      {!debug && recipe && 
        <div>
          <div id="recipeHeader">
            <div id="titleBox">
              <div id="title">{recipe.title}</div>
              {recipeUrl && <a id="url" href={recipeUrl}>{new URL(recipeUrl).hostname}</a>}
            </div>
            <div id="links">
              <div className="textclick" onClick={handleLinkClick()}>Copy link</div>
              <div className="textclick" onClick={handleIngredientClick(recipe)}>Copy ingredients</div>
            </div>
          </div>
          <ErrorBoundary
              fallback={<div>We weren't able to summarize {recipeLink}. You can see the original by clicking the link.</div>}>
            <div id="method">
              {recipe.ingredients &&
                <List.Root padding="0.5em">{recipe.ingredients.map((ingredient, id) =>
                  <List.Item key={id}>{ingredient}</List.Item>)}
                </List.Root>}
              {recipe.method &&
                <List.Root as="ol" padding="0.5em">{recipe.method.map((step, id) =>
                  <List.Item key={id}>{step}</List.Item>)}
                </List.Root>}
            </div>
          </ErrorBoundary>
        </div>
      }
    </div>
  );
};

export default MainPage;
