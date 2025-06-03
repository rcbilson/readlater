# readlater

Richard's quirky read-it-later app.

## What is it?

A simple web app that maintains a set of articles to read. You add a URL,
the server goes off and asks an LLM to summarize the ingredients and steps in
the readlater and caches that for later use.

## Building and running

`make docker` will build a container. I use a docker-compose fragment something
like this to run it:

```
  readlater:
    image: rcbilson/readlater:latest
    pull_policy: never
    ports:
      - 80:9093
    env_file:
      - ./readlater/aws.env
    volumes:
      - ./readlater/data:/app/data
    restart: unless-stopped
```

That `aws.env` file needs to set up `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY` with an IAM user that has permission to access the
Bedrock LLM models, and you need to have been granted access to the particular
model to be used. The actual model used is specified in the
[llm_params](backend/cmd/server/llm_params.go) file and is subject to change as
I find models that work more reliably on this task.

## What's under the hood

The frontend is Vite + TypeScript + React with some chakra-ui. The backend is
Go + Sqlite. And of course the LLM comes from AWS Bedrock.
