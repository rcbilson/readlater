package llm

import (
	"context"
	"errors"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime/types"
)

type ConversationRole string

const (
	RoleUser      = ConversationRole(types.ConversationRoleUser)
	RoleAssistant = ConversationRole(types.ConversationRoleAssistant)
)

type ContentFormat string

const (
	FormatHtml = ContentFormat(types.DocumentFormatHtml)
)

type ConversationBuilder struct {
	input bedrockruntime.ConverseInput
	err   error
}

func newConversationBuilder(modelID string) *ConversationBuilder {
	return &ConversationBuilder{
		input: bedrockruntime.ConverseInput{
			Messages: []types.Message{},
			ModelId:  &modelID,
		},
	}
}

func (cb *ConversationBuilder) AddMessage(role ConversationRole) *ConversationBuilder {
	cb.input.Messages = append(cb.input.Messages, types.Message{
		Role:    types.ConversationRole(role),
		Content: []types.ContentBlock{},
	})
	return cb
}

func (cb *ConversationBuilder) AddText(content string) *ConversationBuilder {
	contentBlock := &cb.input.Messages[len(cb.input.Messages)-1].Content
	*contentBlock = append(*contentBlock, &types.ContentBlockMemberText{Value: content})
	return cb
}

func (cb *ConversationBuilder) AddDocument(format ContentFormat, name string, content []byte) *ConversationBuilder {
	contentBlock := &cb.input.Messages[len(cb.input.Messages)-1].Content
	switch format {
	case FormatHtml:
		*contentBlock = append(*contentBlock,
			&types.ContentBlockMemberDocument{
				Value: types.DocumentBlock{
					Format: types.DocumentFormat(format),
					Source: &types.DocumentSourceMemberBytes{Value: []byte(content)},
					Name:   &name,
				}})
	default:
		cb.err = fmt.Errorf("unsupported content format: %s", format)
	}
	return cb
}

func (llm *Context) NewConversationBuilder() *ConversationBuilder {
	return newConversationBuilder(llm.ModelID)
}

func (llm *Context) Converse(ctx context.Context, cb *ConversationBuilder, stats *Usage) (string, error) {
	if cb.err != nil {
		return "", cb.err
	}

	output, err := llm.client.Converse(ctx, &cb.input)
	if err != nil {
		return "", err
	}

	if stats != nil {
		stats.InputTokens = int(*output.Usage.InputTokens)
		stats.OutputTokens = int(*output.Usage.OutputTokens)
	}

	switch v := output.Output.(type) {
	case *types.ConverseOutputMemberMessage:
		ret := ""
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
