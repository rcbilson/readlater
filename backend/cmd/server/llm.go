package main

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime/types"
)

var modelId = "meta.llama3-8b-instruct-v1:0"

type LlmContext struct {
	client *bedrockruntime.Client
	prompt string
}

func InitializeLlm(ctx context.Context, region string) (*LlmContext, error) {
	sdkConfig, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("Couldn't load default configuration: %w", err)
	}

	client := bedrockruntime.NewFromConfig(sdkConfig)

	prompt := `<|begin_of_text|><|start_header_id|>user<|end_header_id|>

The attached html file contains a recipe. Generate a JSON object with the following properties: "title" containing the title of the recipe, "ingredients" containing the ingredients list of the recipe, and "method" containing the steps required to make the recipe. Only output JSON.<|eot_id|><|start_header_id|>assistant<|end_header_id|>`

	return &LlmContext{client: client, prompt: prompt}, nil
}

func (llm *LlmContext) Ask(ctx context.Context, recipe []byte) (string, error) {
	name := "recipe"
	params := &bedrockruntime.ConverseInput{
		Messages: []types.Message{
			types.Message{
				Content: []types.ContentBlock{
					&types.ContentBlockMemberText{Value: llm.prompt},
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
		},

		ModelId: &modelId,

		// Inference parameters to pass to the model. Converse supports a base set of
		// inference parameters. If you need to pass additional parameters that the model
		// supports, use the additionalModelRequestFields request field.
		//InferenceConfig *types.InferenceConfiguration
	}

	output, err := llm.client.Converse(ctx, params)
	if err != nil {
		return "", err
	}

	log.Println("Converse usage:", *output.Usage.InputTokens, *output.Usage.OutputTokens)

	switch v := output.Output.(type) {
	case *types.ConverseOutputMemberMessage:
                var ret string
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
