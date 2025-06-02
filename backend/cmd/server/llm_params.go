package main

import "knilson.org/recipe/llm"

type LlmParams struct {
	llm.Params
	Prompt  string
	Prefill string
}

var Llama3_8b = LlmParams{
	Params: llm.Params{
		Region:  "ca-central-1",
		ModelID: "meta.llama3-8b-instruct-v1:0",
	},
	Prompt: `<|begin_of_text|><|start_header_id|>user<|end_header_id|>

The attached html file contains a recipe. Generate a JSON object with the following properties: "title" containing the title of the recipe, "ingredients" containing the ingredients list of the recipe, and "method" containing the steps required to make the recipe. Only output JSON.<|eot_id|><|start_header_id|>assistant<|end_header_id|>`,
	Prefill: "{",
}

var Nova_lite = LlmParams{
	Params: llm.Params{
		Region:  "us-east-1",
		ModelID: "us.amazon.nova-lite-v1:0",
	},
	Prompt: `Task:
The attached html file contains a recipe. Generate a JSON object with the following properties: "title" containing the title of the recipe, "ingredients" containing the ingredients list of the recipe, and "method" containing the steps required to make the recipe.

Response style and format requirements:
- All responses MUST be in JSON format.
- Only output JSON, do not include any other text in your response.`,
	Prefill: "{",
}

var theModel = &Nova_lite
