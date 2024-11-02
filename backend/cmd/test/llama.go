package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime/types"
)

var modelId = "meta.llama3-8b-instruct-v1:0"

// InvokeModelWrapper encapsulates Amazon Bedrock actions used in the examples.
// It contains a Bedrock Runtime client that is used to invoke foundation models.
type InvokeModelWrapper struct {
	BedrockRuntimeClient *bedrockruntime.Client
}

// Each model provider has their own individual request and response formats.
// For the format, ranges, and default values for Meta Llama 2 Chat, refer to:
// https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-meta.html

type Llama2Request struct {
	Prompt       string  `json:"prompt"`
	MaxGenLength int     `json:"max_gen_len,omitempty"`
	TopP         float64 `json:"top_p,omitempty"`
	Temperature  float64 `json:"temperature,omitempty"`
}

type Llama2Response struct {
	Generation string `json:"generation"`
}

// Invokes Meta Llama 2 Chat on Amazon Bedrock to run an inference using the input
// provided in the request body.
func (wrapper InvokeModelWrapper) InvokeConverse(ctx context.Context, prompt string, recipe []byte) (string, error) {
	name := "recipe"
	params := &bedrockruntime.ConverseInput{
		Messages: []types.Message{
			types.Message{
				Content: []types.ContentBlock{
					&types.ContentBlockMemberText{Value: prompt},
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

	output, err := wrapper.BedrockRuntimeClient.Converse(ctx, params)
	if err != nil {
		log.Fatal("failed to converse: ", err)
	}

	log.Println("Converse usage:", *output.Usage.InputTokens, *output.Usage.OutputTokens)

	switch v := output.Output.(type) {
	case *types.ConverseOutputMemberMessage:
		ret := fmt.Sprintf("%s: ", v.Value.Role)
		for _, block := range v.Value.Content {
			switch v := block.(type) {
			case *types.ContentBlockMemberDocument:
				ret += "(document)"

			case *types.ContentBlockMemberGuardContent:
				ret += "(blocked)"

			case *types.ContentBlockMemberImage:
				ret += "(image block)"

			case *types.ContentBlockMemberText:
				ret += "<" + v.Value + ">"

			case *types.ContentBlockMemberToolResult:
				ret += "(tool result)"

			case *types.ContentBlockMemberToolUse:
				ret += "(tool use)"

			case *types.UnknownUnionMember:
				fmt.Println("unknown tag:", v.Tag)

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

// Invokes Meta Llama 2 Chat on Amazon Bedrock to run an inference using the input
// provided in the request body.
func (wrapper InvokeModelWrapper) InvokeLlama2(ctx context.Context, prompt string) (string, error) {

	body, err := json.Marshal(Llama2Request{
		Prompt:       prompt,
		MaxGenLength: 512,
		Temperature:  0.5,
		TopP:         0.9,
	})

	if err != nil {
		log.Fatal("failed to marshal", err)
	}

	output, err := wrapper.BedrockRuntimeClient.InvokeModel(ctx, &bedrockruntime.InvokeModelInput{
		ModelId:     aws.String(modelId),
		ContentType: aws.String("application/json"),
		Body:        body,
	})

	if err != nil {
		return "", err
	}

	var response Llama2Response
	if err := json.Unmarshal(output.Body, &response); err != nil {
		log.Fatal("failed to unmarshal", err)
	}

	return response.Generation, nil
}

func ProcessError(err error, modelId string) {
	errMsg := err.Error()
	if strings.Contains(errMsg, "no such host") {
		log.Printf(`The Bedrock service is not available in the selected region.
                    Please double-check the service availability for your region at
                    https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/.\n`)
	} else if strings.Contains(errMsg, "Could not resolve the foundation model") {
		log.Printf(`Could not resolve the foundation model from model identifier: \"%v\".
                    Please verify that the requested model exists and is accessible
                    within the specified region.\n
                    `, modelId)
	} else {
		log.Printf("Couldn't invoke model: \"%v\". Here's why: %v\n", modelId, err)
	}
}

// main uses the AWS SDK for Go (v2) to create an Amazon Bedrock Runtime client
// and invokes Anthropic Claude 2 inside your account and the chosen region.
// This example uses the default settings specified in your shared credentials
// and config files.
func main() {

	region := flag.String("region", "ca-central-1", "The AWS region")
	flag.Parse()

	fmt.Printf("Using AWS region: %s\n", *region)

	ctx := context.Background()
	sdkConfig, err := config.LoadDefaultConfig(ctx, config.WithRegion(*region))
	if err != nil {
		fmt.Println("Couldn't load default configuration. Have you set up your AWS account?")
		fmt.Println(err)
		return
	}

	client := bedrockruntime.NewFromConfig(sdkConfig)
	wrapper := InvokeModelWrapper{BedrockRuntimeClient: client}

	//prompt := "Hello, how are you today?"
	prompt := `<|begin_of_text|><|start_header_id|>user<|end_header_id|>

The attached html file contains a recipe. Generate a JSON object with the following properties: "title" containing the title of the recipe, "ingredients" containing the ingredients list of the recipe, and "method" containing the steps required to make the recipe. Only output JSON.<|eot_id|><|start_header_id|>assistant<|end_header_id|>`

	var httpClient http.Client

	//url := "https://www.allrecipes.com/recipe/220943/chef-johns-buttermilk-biscuits/"
	url := "https://www.seriouseats.com/classic-banana-bread-recipe"
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		log.Fatal(err)
	}
	// spoof user agent to work around bot detection
	req.Header["User-Agent"] = []string{"Mozilla/5.0 (X11; CrOS x86_64 8172.45.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.64 Safari/537.36"}
	res, err := httpClient.Do(req)
	if err != nil {
		log.Fatal(err)
	}

	body, err := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode > 299 {
		log.Println("Headers:")
		for k, v := range res.Header {
			log.Println("    ", k, ":", v)
		}
		log.Fatalf("Response failed with status code: %d and\nbody: %s\n", res.StatusCode, body)
	}
	if err != nil {
		log.Fatal(err)
	}

	response, err := wrapper.InvokeConverse(ctx, prompt, body)

	if err != nil {
		ProcessError(err, modelId)
		return
	}

	fmt.Println("Prompt:\n", prompt)
	fmt.Println("Response from Llama:\n", response)
}
