package main

import (
	"context"
	"fmt"
	"io"
	"os/exec"
)

type summarizeFunc func(ctx context.Context, article []byte) (string, error)

func pandocSummarizer() summarizeFunc {
	return func(ctx context.Context, article []byte) (string, error) {
		// Use os/exec to run pandoc
		cmd := exec.CommandContext(ctx, "pandoc", "-f", "html", "-t", "commonmark", "--strip-comments")
		stdin, err := cmd.StdinPipe()
		if err != nil {
			return "", fmt.Errorf("failed to get stdin pipe: %w", err)
		}
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			return "", fmt.Errorf("failed to get stdout pipe: %w", err)
		}
		if err := cmd.Start(); err != nil {
			return "", fmt.Errorf("failed to start pandoc: %w", err)
		}
		_, err = stdin.Write(article)
		stdin.Close()
		if err != nil {
			return "", fmt.Errorf("failed to write to pandoc stdin: %w", err)
		}
		output, err := io.ReadAll(stdout)
		if err != nil {
			return "", fmt.Errorf("failed to read pandoc output: %w", err)
		}
		if err := cmd.Wait(); err != nil {
			return "", fmt.Errorf("pandoc failed: %w", err)
		}
		return string(output), nil
	}
}
