package main

import "github.com/rcbilson/readlater/llm"

type LlmParams struct {
	llm.Params
	Prompt  string
	Prefill string
}

var Nova_lite = LlmParams{
	Params: llm.Params{
		Region:  "us-east-1",
		ModelID: "us.amazon.nova-lite-v1:0",
	},
	Prompt: `Task:
Take the attached article in HTML format and extract the article headings and text, formatting the output as Markdown.
The output should be a single Markdown document with the article title as the first heading, followed by the headings and text of the article.
The output should not contain any HTML tags, and should be formatted as follows:
# Article Title
## Heading 1
### Subheading 1.1
## Heading 2
### Subheading 2.1
## Heading 3
### Subheading 3.1
The output should not contain any additional text or explanations, only the Markdown formatted article.
The input will be a single HTML document, and the output should be a single Markdown document.`,
	Prefill: "# ",
}

var theModel = &Nova_lite
