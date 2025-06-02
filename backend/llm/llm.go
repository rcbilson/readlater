package llm

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"
)

type Llm interface {
	NewConversationBuilder() *ConversationBuilder
	Converse(ctx context.Context, cb *ConversationBuilder, stats *Usage) (string, error)
}

type Params struct {
	Region  string
	ModelID string
}

type Context struct {
	Params
	client *bedrockruntime.Client
}

type Usage struct {
	InputTokens  int
	OutputTokens int
}

func New(ctx context.Context, params Params) (Llm, error) {
	sdkConfig, err := config.LoadDefaultConfig(ctx, config.WithRegion(params.Region))
	if err != nil {
		return nil, fmt.Errorf("couldn't load default configuration: %w", err)
	}

	client := bedrockruntime.NewFromConfig(sdkConfig)

	return &Context{Params: params, client: client}, nil
}
