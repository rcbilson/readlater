package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime/types"
)

type Llm interface {
	Ask(ctx context.Context, recipe []byte, stats *LlmStats) (string, error)
}

type LlmContext struct {
	LlmParams
	client *bedrockruntime.Client
}

type LlmStats struct {
	InputTokens  int
	OutputTokens int
}

func NewLlm(ctx context.Context, params LlmParams) (Llm, error) {
	sdkConfig, err := config.LoadDefaultConfig(ctx, config.WithRegion(params.Region))
	if err != nil {
		return nil, fmt.Errorf("couldn't load default configuration: %w", err)
	}

	client := bedrockruntime.NewFromConfig(sdkConfig)

	return &LlmContext{LlmParams: params, client: client}, nil
}

func (llm *LlmContext) Ask(ctx context.Context, recipe []byte, stats *LlmStats) (string, error) {
	name := "recipe"
	params := &bedrockruntime.ConverseInput{
		Messages: []types.Message{
			{
				Content: []types.ContentBlock{
					&types.ContentBlockMemberText{Value: llm.Prompt},
					&types.ContentBlockMemberDocument{
						Value: types.DocumentBlock{
							Format: types.DocumentFormatHtml,
							Name:   &name,
							Source: &types.DocumentSourceMemberBytes{
								Value: recipe,
							},
						},
					},
				},
				Role: types.ConversationRoleUser,
			},
			{
				Content: []types.ContentBlock{
					&types.ContentBlockMemberText{Value: llm.Prefill},
				},
				Role: types.ConversationRoleAssistant,
			},
		},

		ModelId: &llm.ModelID,

		// Inference parameters to pass to the model. Converse supports a base set of
		// inference parameters. If you need to pass additional parameters that the model
		// supports, use the additionalModelRequestFields request field.
		//InferenceConfig *types.InferenceConfiguration
	}

	output, err := llm.client.Converse(ctx, params)
	if err != nil {
		return "", err
	}

	if stats != nil {
		stats.InputTokens = int(*output.Usage.InputTokens)
		stats.OutputTokens = int(*output.Usage.OutputTokens)
	}

	switch v := output.Output.(type) {
	case *types.ConverseOutputMemberMessage:
		ret := llm.Prefill
		for _, block := range v.Value.Content {
			switch v := block.(type) {
			case *types.ContentBlockMemberText:
				ret += v.Value
			default:
				fmt.Println("union is nil or unknown type")

			}
		}
		return ret, nil

	case *types.UnknownUnionMember:
		return "", fmt.Errorf("unknown tag: %v", v.Tag)

	default:
		return "", errors.New("union is nil or unknown type")

	}
}
