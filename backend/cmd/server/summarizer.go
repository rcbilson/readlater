package main

import (
	"context"

	"github.com/rcbilson/recipe/llm"
)

type summarizeFunc func(ctx context.Context, recipe []byte, stats *llm.Usage) (string, error)

func newSummarizer(llmClient llm.Llm, params LlmParams) summarizeFunc {
	return func(ctx context.Context, recipe []byte, stats *llm.Usage) (string, error) {
		cb := llmClient.NewConversationBuilder().
			AddMessage(llm.RoleUser).
			AddText(params.Prompt).
			AddDocument(llm.FormatHtml, "recipe", recipe).
			AddMessage(llm.RoleAssistant).
			AddText(params.Prefill)

		output, err := llmClient.Converse(ctx, cb, stats)
		if err != nil {
			return "", err
		}
		return params.Prefill + output, nil
	}
}
