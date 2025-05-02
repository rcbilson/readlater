# recipe

Richard's quirky recipe manager.

## What is it?

A simple web app that maintains a database of Internet recipes. You add a URL,
the server goes off and asks an LLM to summarize the ingredients and steps in
the recipe and caches that for later use.

I realize that it is a bit of a dirtbag move to take people's carefully crafted
and monetized recipe pages and pull out only the bits that I care about. I want
to make it clear that I do read the original recipes, and you should too! But,
when I want to actually cook one of the recipes it's generally the case that
the originals are just too difficult to refer to easily, particularly if one is
using a phone as I often am.

## Building and running

`make docker` will build a container. I use a docker-compose fragment something
like this to run it:

  recipe:
    image: rcbilson/recipe:latest
    pull_policy: never
    ports:
      - 80:9093
    env_file:
      - ./recipe/aws.env
    volumes:
      - ./recipe/data:/app/data
    restart: unless-stopped

That `aws.env` file needs to set up `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY` with an IAM user that has permission to access the
Bedrock LLM models, and you need to have been granted access to the particular
model to be used. The actual model used is specified in the
[llm_params](backend/cmd/server/llm_params.go) file and is subject to change as
I find models that work more reliably on this task.

## What's under the hood

The frontend is Vite + TypeScript + React with some chakra-ui. The backend is
Go + Sqlite. And of course the LLM comes from AWS Bedrock.

## Known issues

Sometimes the LLM will refuse to summarize a particular recipe, or it won't
return anything useful. As of now there isn't really any recourse if this happens.
If a recipe summarizes weirdly, you can use CTRL-Q to show the actual response
returned by the LLM.
