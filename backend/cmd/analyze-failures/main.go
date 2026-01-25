package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"sort"
	"time"

	"github.com/rcbilson/readlater/www"
)

type analyzeConfig struct {
	logFile    string
	reportType string
	since      string
	topN       int
}

type domainStats struct {
	domain         string
	totalFailures  int
	categories     map[www.FailureCategory]int
	strategies     map[string]int
	lastFailure    time.Time
}

type categoryStats struct {
	category       www.FailureCategory
	count          int
	domains        map[string]int
	strategies     map[string]int
	cloudflareRate float64
}

type strategyStats struct {
	strategy string
	count    int
	failures int
}

func readFailureLog(filename string, since time.Time) ([]www.FailureLog, error) {
	file, err := os.Open(filename)
	if err != nil {
		return nil, fmt.Errorf("failed to open log file: %w", err)
	}
	defer file.Close()

	var entries []www.FailureLog
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		var entry www.FailureLog
		if err := json.Unmarshal(scanner.Bytes(), &entry); err != nil {
			log.Printf("Warning: failed to parse log line: %v", err)
			continue
		}

		// Parse timestamp
		timestamp, err := time.Parse(time.RFC3339, entry.Timestamp)
		if err != nil {
			log.Printf("Warning: failed to parse timestamp: %v", err)
			continue
		}

		// Filter by time if specified
		if !since.IsZero() && timestamp.Before(since) {
			continue
		}

		entries = append(entries, entry)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading log file: %w", err)
	}

	return entries, nil
}

func generateSummaryReport(entries []www.FailureLog, topN int) {
	if len(entries) == 0 {
		fmt.Println("No failures found in the specified time period.")
		return
	}

	fmt.Println("=== Failure Summary Report ===")
	fmt.Printf("Total failures: %d\n", len(entries))
	fmt.Printf("Time range: %s to %s\n\n", entries[0].Timestamp, entries[len(entries)-1].Timestamp)

	// Aggregate by category
	categoryCount := make(map[www.FailureCategory]int)
	cloudflareCount := 0

	for _, entry := range entries {
		categoryCount[entry.FailureCategory]++
		if entry.CloudflareMitigated {
			cloudflareCount++
		}
	}

	fmt.Println("Failures by Category:")
	// Sort categories by count
	type catCount struct {
		cat   www.FailureCategory
		count int
	}
	var cats []catCount
	for cat, count := range categoryCount {
		cats = append(cats, catCount{cat, count})
	}
	sort.Slice(cats, func(i, j int) bool {
		return cats[i].count > cats[j].count
	})

	for _, cc := range cats {
		pct := float64(cc.count) / float64(len(entries)) * 100
		fmt.Printf("  %-25s %5d  (%5.1f%%)\n", cc.cat, cc.count, pct)
	}

	fmt.Printf("\nCloudflare-mitigated failures: %d (%.1f%%)\n",
		cloudflareCount, float64(cloudflareCount)/float64(len(entries))*100)

	// Top failing domains
	domainCount := make(map[string]int)
	for _, entry := range entries {
		if entry.Domain != "" {
			domainCount[entry.Domain]++
		}
	}

	type domCount struct {
		domain string
		count  int
	}
	var domains []domCount
	for domain, count := range domainCount {
		domains = append(domains, domCount{domain, count})
	}
	sort.Slice(domains, func(i, j int) bool {
		return domains[i].count > domains[j].count
	})

	fmt.Printf("\nTop %d Failing Domains:\n", topN)
	for i, dc := range domains {
		if i >= topN {
			break
		}
		pct := float64(dc.count) / float64(len(entries)) * 100
		fmt.Printf("  %2d. %-40s %5d  (%5.1f%%)\n", i+1, dc.domain, dc.count, pct)
	}

	// Strategy usage
	strategyCount := make(map[string]int)
	for _, entry := range entries {
		for _, strategy := range entry.StrategiesAttempted {
			strategyCount[strategy]++
		}
	}

	fmt.Println("\nStrategy Usage (attempts):")
	type stratCount struct {
		strategy string
		count    int
	}
	var strats []stratCount
	for strategy, count := range strategyCount {
		strats = append(strats, stratCount{strategy, count})
	}
	sort.Slice(strats, func(i, j int) bool {
		return strats[i].count > strats[j].count
	})

	for _, sc := range strats {
		fmt.Printf("  %-20s %5d\n", sc.strategy, sc.count)
	}
}

func generateDomainReport(entries []www.FailureLog, topN int) {
	if len(entries) == 0 {
		fmt.Println("No failures found in the specified time period.")
		return
	}

	fmt.Println("=== Domain Profiling Report ===")
	fmt.Printf("Analyzing %d failures\n\n", len(entries))

	// Aggregate by domain
	domains := make(map[string]*domainStats)

	for _, entry := range entries {
		if entry.Domain == "" {
			continue
		}

		stats, exists := domains[entry.Domain]
		if !exists {
			stats = &domainStats{
				domain:     entry.Domain,
				categories: make(map[www.FailureCategory]int),
				strategies: make(map[string]int),
			}
			domains[entry.Domain] = stats
		}

		stats.totalFailures++
		stats.categories[entry.FailureCategory]++
		for _, strategy := range entry.StrategiesAttempted {
			stats.strategies[strategy]++
		}

		timestamp, _ := time.Parse(time.RFC3339, entry.Timestamp)
		if timestamp.After(stats.lastFailure) {
			stats.lastFailure = timestamp
		}
	}

	// Sort by failure count
	var domainList []*domainStats
	for _, stats := range domains {
		domainList = append(domainList, stats)
	}
	sort.Slice(domainList, func(i, j int) bool {
		return domainList[i].totalFailures > domainList[j].totalFailures
	})

	// Display top N domains
	for i, stats := range domainList {
		if i >= topN {
			break
		}

		fmt.Printf("%d. %s\n", i+1, stats.domain)
		fmt.Printf("   Total failures: %d\n", stats.totalFailures)
		fmt.Printf("   Last failure: %s\n", stats.lastFailure.Format(time.RFC3339))

		fmt.Println("   Failure categories:")
		for cat, count := range stats.categories {
			pct := float64(count) / float64(stats.totalFailures) * 100
			fmt.Printf("     %-25s %3d  (%5.1f%%)\n", cat, count, pct)
		}

		fmt.Println("   Strategies attempted:")
		for strategy, count := range stats.strategies {
			fmt.Printf("     %-20s %3d\n", strategy, count)
		}
		fmt.Println()
	}
}

func generateCategoryReport(entries []www.FailureLog) {
	if len(entries) == 0 {
		fmt.Println("No failures found in the specified time period.")
		return
	}

	fmt.Println("=== Category Analysis Report ===")
	fmt.Printf("Analyzing %d failures\n\n", len(entries))

	// Aggregate by category
	categories := make(map[www.FailureCategory]*categoryStats)

	for _, entry := range entries {
		stats, exists := categories[entry.FailureCategory]
		if !exists {
			stats = &categoryStats{
				category:   entry.FailureCategory,
				domains:    make(map[string]int),
				strategies: make(map[string]int),
			}
			categories[entry.FailureCategory] = stats
		}

		stats.count++
		if entry.Domain != "" {
			stats.domains[entry.Domain]++
		}
		for _, strategy := range entry.StrategiesAttempted {
			stats.strategies[strategy]++
		}
		if entry.CloudflareMitigated {
			stats.cloudflareRate++
		}
	}

	// Calculate percentages and sort
	var catList []*categoryStats
	for _, stats := range categories {
		stats.cloudflareRate = stats.cloudflareRate / float64(stats.count) * 100
		catList = append(catList, stats)
	}
	sort.Slice(catList, func(i, j int) bool {
		return catList[i].count > catList[j].count
	})

	// Display each category
	for _, stats := range catList {
		fmt.Printf("Category: %s\n", stats.category)
		fmt.Printf("  Count: %d (%.1f%% of all failures)\n",
			stats.count, float64(stats.count)/float64(len(entries))*100)
		fmt.Printf("  Cloudflare rate: %.1f%%\n", stats.cloudflareRate)

		// Top domains for this category
		type domCount struct {
			domain string
			count  int
		}
		var domainList []domCount
		for domain, count := range stats.domains {
			domainList = append(domainList, domCount{domain, count})
		}
		sort.Slice(domainList, func(i, j int) bool {
			return domainList[i].count > domainList[j].count
		})

		fmt.Println("  Top domains:")
		for i, dc := range domainList {
			if i >= 5 {
				break
			}
			fmt.Printf("    %d. %-40s %3d\n", i+1, dc.domain, dc.count)
		}

		// Strategy usage for this category
		fmt.Println("  Strategies attempted:")
		type stratCount struct {
			strategy string
			count    int
		}
		var stratList []stratCount
		for strategy, count := range stats.strategies {
			stratList = append(stratList, stratCount{strategy, count})
		}
		sort.Slice(stratList, func(i, j int) bool {
			return stratList[i].count > stratList[j].count
		})

		for _, sc := range stratList {
			fmt.Printf("    %-20s %5d\n", sc.strategy, sc.count)
		}
		fmt.Println()
	}
}

func generateRetryReport(entries []www.FailureLog) {
	if len(entries) == 0 {
		fmt.Println("No failures found in the specified time period.")
		return
	}

	fmt.Println("=== Retry Recommendations ===")
	fmt.Printf("Analyzing %d failures\n\n", len(entries))

	// Group by URL
	urlFailures := make(map[string][]www.FailureLog)
	for _, entry := range entries {
		urlFailures[entry.URL] = append(urlFailures[entry.URL], entry)
	}

	// Categorize retry recommendations
	retryCloudflare := []string{}
	retryBotDetection := []string{}
	retryTimeout := []string{}

	for url, failures := range urlFailures {
		// Get the most recent failure
		mostRecent := failures[len(failures)-1]

		switch mostRecent.FailureCategory {
		case www.CloudflareChallenge:
			retryCloudflare = append(retryCloudflare, url)
		case www.BotDetection:
			retryBotDetection = append(retryBotDetection, url)
		case www.Timeout:
			retryTimeout = append(retryTimeout, url)
		}
	}

	fmt.Printf("URLs to retry with Cloudflare bypass (%d):\n", len(retryCloudflare))
	if len(retryCloudflare) > 0 {
		fmt.Println("  These failed due to Cloudflare challenges and may succeed with FlareSolverr or headless browser:")
		for i, url := range retryCloudflare {
			if i >= 20 {
				fmt.Printf("  ... and %d more\n", len(retryCloudflare)-20)
				break
			}
			fmt.Printf("  - %s\n", url)
		}
	}
	fmt.Println()

	fmt.Printf("URLs to retry with better bot detection evasion (%d):\n", len(retryBotDetection))
	if len(retryBotDetection) > 0 {
		fmt.Println("  These failed due to bot detection and may succeed with TLS fingerprinting or better headers:")
		for i, url := range retryBotDetection {
			if i >= 20 {
				fmt.Printf("  ... and %d more\n", len(retryBotDetection)-20)
				break
			}
			fmt.Printf("  - %s\n", url)
		}
	}
	fmt.Println()

	fmt.Printf("URLs to retry (timeout) (%d):\n", len(retryTimeout))
	if len(retryTimeout) > 0 {
		fmt.Println("  These timed out and may succeed with a retry or longer timeout:")
		for i, url := range retryTimeout {
			if i >= 20 {
				fmt.Printf("  ... and %d more\n", len(retryTimeout)-20)
				break
			}
			fmt.Printf("  - %s\n", url)
		}
	}
}

func main() {
	config := analyzeConfig{}

	flag.StringVar(&config.logFile, "log", "fail.log", "Path to failure log file")
	flag.StringVar(&config.reportType, "report", "summary", "Report type: summary, domain, category, retry")
	flag.StringVar(&config.since, "since", "", "Only analyze failures since this time (RFC3339 format)")
	flag.IntVar(&config.topN, "top", 10, "Number of top items to show in reports")
	flag.Parse()

	// Parse since time if provided
	var sinceTime time.Time
	if config.since != "" {
		var err error
		sinceTime, err = time.Parse(time.RFC3339, config.since)
		if err != nil {
			log.Fatalf("Failed to parse since time: %v", err)
		}
	}

	// Read the failure log
	entries, err := readFailureLog(config.logFile, sinceTime)
	if err != nil {
		log.Fatalf("Failed to read failure log: %v", err)
	}

	// Generate the requested report
	switch config.reportType {
	case "summary":
		generateSummaryReport(entries, config.topN)
	case "domain":
		generateDomainReport(entries, config.topN)
	case "category":
		generateCategoryReport(entries)
	case "retry":
		generateRetryReport(entries)
	default:
		log.Fatalf("Unknown report type: %s (valid types: summary, domain, category, retry)", config.reportType)
	}
}
