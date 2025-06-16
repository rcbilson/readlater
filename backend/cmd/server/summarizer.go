package main

import (
	"context"
	"fmt"

	"github.com/rcbilson/readlater/llm"
)

type summarizeFunc func(ctx context.Context, article []byte, stats *llm.Usage) (string, error)

func newSummarizer(llmClient llm.Llm, params LlmParams) summarizeFunc {
	return func(ctx context.Context, article []byte, stats *llm.Usage) (string, error) {
		cb := llmClient.NewConversationBuilder().
			AddMessage(llm.RoleUser).
			AddText(params.Prompt).
			AddDocument(llm.FormatHtml, "article", article).
			AddMessage(llm.RoleAssistant).
			AddText(params.Prefill)

		response, err := llmClient.ConverseResponse(ctx, cb)
		if err != nil {
			return "", err
		}
		if stats != nil {
			*stats = response.Usage
		}
		if response.StopReason != llm.StopReasonEndTurn {
			err = fmt.Errorf("Unexpected llm stop reason: %s", response.StopReason)
		}
		return params.Prefill + response.Output, err
	}
}
