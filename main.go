package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/joho/godotenv"
	"github.com/valyala/fasthttp"
)

var (
	apiURL       string
	modelDefault string
	modelThinking string
)

// ── Request from frontend ────────────────────────────────────────────────────

type ChatRequest struct {
	Message    string `json:"message"`
	Thinking   bool   `json:"thinking"`
	Confidence bool   `json:"confidence"`
}

// ── API payload ──────────────────────────────────────────────────────────────

type APIPayload struct {
	Model          string    `json:"model"`
	Messages       []Message `json:"messages"`
	Temperature    float64   `json:"temperature"`
	Stream         bool      `json:"stream"`
	EnableThinking *bool     `json:"enable_thinking,omitempty"`
	Tools          []Tool    `json:"tools,omitempty"`
}

// Message supports user / assistant / tool roles
type Message struct {
	Role       string      `json:"role"`
	Content    interface{} `json:"content,omitempty"` // string | []ContentPart
	ToolCalls  []ToolCall  `json:"tool_calls,omitempty"`
	ToolCallID string      `json:"tool_call_id,omitempty"`
}

type ContentPart struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// ── Tool definitions ─────────────────────────────────────────────────────────

type Tool struct {
	Type     string       `json:"type"`
	Function ToolFunction `json:"function"`
}

type ToolFunction struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters"`
}

type ToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

// ── Stream chunk types ────────────────────────────────────────────────────────

type StreamChunk struct {
	Choices []struct {
		Delta struct {
			Content   string     `json:"content"`
			Reasoning string     `json:"reasoning"`
			ToolCalls []struct {
				Index    int    `json:"index"`
				ID       string `json:"id"`
				Type     string `json:"type"`
				Function struct {
					Name      string `json:"name"`
					Arguments string `json:"arguments"`
				} `json:"function"`
			} `json:"tool_calls"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
}

// ── Available tools ───────────────────────────────────────────────────────────

var tools = []Tool{
	{
		Type: "function",
		Function: ToolFunction{
			Name:        "get_current_time",
			Description: "Get the current date and time in Thailand timezone (Asia/Bangkok)",
			Parameters: map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
				"required":   []string{},
			},
		},
	},
	{
		Type: "function",
		Function: ToolFunction{
			Name:        "get_weather",
			Description: "Get the current weather for a given location. Use Thai or English city names.",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"location": map[string]interface{}{
						"type":        "string",
						"description": "City or location name, e.g. Bangkok, เชียงใหม่, Phuket",
					},
				},
				"required": []string{"location"},
			},
		},
	},
}

func executeTool(name, arguments string) string {
	switch name {
	case "get_current_time":
		loc, _ := time.LoadLocation("Asia/Bangkok")
		now := time.Now().In(loc)
		return now.Format("Monday, 2 January 2006 15:04:05 MST")

	case "get_weather":
		var args struct {
			Location string `json:"location"`
		}
		if err := json.Unmarshal([]byte(arguments), &args); err != nil || args.Location == "" {
			return "error: missing location argument"
		}
		result, err := fetchWeather(args.Location)
		if err != nil {
			return "error: " + err.Error()
		}
		return result
	}
	return "unknown tool"
}

// ── Weather helpers ───────────────────────────────────────────────────────────

func fetchWeather(location string) (string, error) {
	// 1. Geocoding: location name → lat/lon
	geoURL := fmt.Sprintf(
		"https://geocoding-api.open-meteo.com/v1/search?name=%s&count=1&language=en&format=json",
		location,
	)
	geoResp, err := http.Get(geoURL)
	if err != nil {
		return "", fmt.Errorf("geocoding request failed: %w", err)
	}
	defer geoResp.Body.Close()

	var geoData struct {
		Results []struct {
			Name      string  `json:"name"`
			Country   string  `json:"country"`
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
		} `json:"results"`
	}
	if err := json.NewDecoder(geoResp.Body).Decode(&geoData); err != nil || len(geoData.Results) == 0 {
		return "", fmt.Errorf("location %q not found", location)
	}

	place := geoData.Results[0]

	// 2. Weather: lat/lon → current weather
	weatherURL := fmt.Sprintf(
		"https://api.open-meteo.com/v1/forecast?latitude=%f&longitude=%f"+
			"&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m"+
			"&timezone=Asia%%2FBangkok&wind_speed_unit=kmh",
		place.Latitude, place.Longitude,
	)
	wResp, err := http.Get(weatherURL)
	if err != nil {
		return "", fmt.Errorf("weather request failed: %w", err)
	}
	defer wResp.Body.Close()

	var wData struct {
		Current struct {
			Temperature      float64 `json:"temperature_2m"`
			ApparentTemp     float64 `json:"apparent_temperature"`
			Humidity         int     `json:"relative_humidity_2m"`
			WindSpeed        float64 `json:"wind_speed_10m"`
			WeatherCode      int     `json:"weather_code"`
		} `json:"current"`
	}
	if err := json.NewDecoder(wResp.Body).Decode(&wData); err != nil {
		return "", fmt.Errorf("weather decode failed: %w", err)
	}

	c := wData.Current
	return fmt.Sprintf(
		"Location: %s, %s\nCondition: %s\nTemperature: %.1f°C (feels like %.1f°C)\nHumidity: %d%%\nWind: %.1f km/h",
		place.Name, place.Country,
		weatherCodeDescription(c.WeatherCode),
		c.Temperature, c.ApparentTemp,
		c.Humidity,
		c.WindSpeed,
	), nil
}

func weatherCodeDescription(code int) string {
	switch {
	case code == 0:
		return "Clear sky ☀️"
	case code <= 2:
		return "Partly cloudy ⛅"
	case code == 3:
		return "Overcast ☁️"
	case code <= 49:
		return "Foggy 🌫️"
	case code <= 59:
		return "Drizzle 🌦️"
	case code <= 69:
		return "Rain 🌧️"
	case code <= 79:
		return "Snow 🌨️"
	case code <= 84:
		return "Rain showers 🌦️"
	case code <= 94:
		return "Thunderstorm ⛈️"
	default:
		return "Severe thunderstorm 🌩️"
	}
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	godotenv.Load()

	apiKey := os.Getenv("API_KEY")
	if apiKey == "" {
		log.Fatal("API_KEY is not set. Please add it to .env file")
	}

	apiURL = os.Getenv("API_URL")
	if apiURL == "" {
		log.Fatal("API_URL is not set. Please add it to .env file")
	}

	modelDefault = os.Getenv("MODEL_DEFAULT")
	if modelDefault == "" {
		log.Fatal("MODEL_DEFAULT is not set. Please add it to .env file")
	}

	modelThinking = os.Getenv("MODEL_THINKING")
	if modelThinking == "" {
		log.Fatal("MODEL_THINKING is not set. Please add it to .env file")
	}

	app := fiber.New(fiber.Config{CompressedFileSuffix: ""})

	app.Static("/", "./web")
	app.Post("/api/chat", chatHandler)

	log.Println("Server running at http://localhost:3000")
	log.Fatal(app.Listen(":3000"))
}

// ── Handler ───────────────────────────────────────────────────────────────────

func chatHandler(c *fiber.Ctx) error {
	var req ChatRequest
	if err := c.BodyParser(&req); err != nil || req.Message == "" {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	apiKey := os.Getenv("API_KEY")

	model := modelDefault
	var enableThinking *bool
	if req.Thinking {
		model = modelThinking
		t := true
		enableThinking = &t
	}

	log.Printf("[chat] model=%s thinking=%v message=%q", model, req.Thinking, req.Message)

	messages := []Message{
		{
			Role:    "user",
			Content: []ContentPart{{Type: "text", Text: req.Message}},
		},
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(fasthttp.StreamWriter(func(w *bufio.Writer) {
		doStream(w, messages, model, enableThinking, apiKey)
	}))

	return nil
}

// ── Streaming with tool-call support ─────────────────────────────────────────

func doStream(w *bufio.Writer, messages []Message, model string, enableThinking *bool, apiKey string) {
	payload := APIPayload{
		Model:          model,
		Messages:       messages,
		Temperature:    0.2,
		Stream:         true,
		EnableThinking: enableThinking,
		Tools:          tools,
	}

	body, _ := json.Marshal(payload)

	httpReq, err := http.NewRequest("POST", apiURL, bytes.NewReader(body))
	if err != nil {
		sendSSE(w, "error", `{"message":"build request failed"}`)
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		sendSSE(w, "error", `{"message":"upstream request failed"}`)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var buf bytes.Buffer
		buf.ReadFrom(resp.Body)
		log.Printf("[chat] upstream %d: %s", resp.StatusCode, buf.String())
		sendSSE(w, "error", fmt.Sprintf(`{"message":"upstream %d"}`, resp.StatusCode))
		return
	}

	// Collect tool calls across chunks (index → accumulated)
	type pendingToolCall struct {
		id        string
		name      string
		arguments strings.Builder
	}
	pending := map[int]*pendingToolCall{}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	var assistantContent strings.Builder
	finishReason := ""

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		if !strings.HasPrefix(line, "data:") {
			continue
		}

		raw := strings.TrimSpace(line[5:])
		if raw == "[DONE]" {
			break
		}

		var chunk StreamChunk
		if err := json.Unmarshal([]byte(raw), &chunk); err != nil || len(chunk.Choices) == 0 {
			continue
		}

		choice := chunk.Choices[0]
		delta := choice.Delta
		finishReason = choice.FinishReason

		// Accumulate tool call deltas
		for _, tc := range delta.ToolCalls {
			if _, ok := pending[tc.Index]; !ok {
				pending[tc.Index] = &pendingToolCall{}
			}
			p := pending[tc.Index]
			if tc.ID != "" {
				p.id = tc.ID
			}
			if tc.Function.Name != "" {
				p.name = tc.Function.Name
			}
			p.arguments.WriteString(tc.Function.Arguments)
		}

		// Forward reasoning/content chunks as-is
		if delta.Reasoning != "" || delta.Content != "" {
			assistantContent.WriteString(delta.Content)
			fmt.Fprintf(w, "%s\n\n", line)
			w.Flush()
		}
	}

	if scanner.Err() != nil {
		log.Printf("[chat] scanner error: %v", scanner.Err())
	}

	// Handle tool calls
	if finishReason == "tool_calls" && len(pending) > 0 {
		// Build assistant message with tool_calls
		var toolCalls []ToolCall
		for i := 0; i < len(pending); i++ {
			p := pending[i]
			toolCalls = append(toolCalls, ToolCall{
				ID:   p.id,
				Type: "function",
				Function: struct {
					Name      string `json:"name"`
					Arguments string `json:"arguments"`
				}{Name: p.name, Arguments: p.arguments.String()},
			})
		}

		// Notify frontend which tool is being called
		for _, tc := range toolCalls {
			sendSSE(w, "tool_use", fmt.Sprintf(`{"name":%q}`, tc.Function.Name))
			log.Printf("[tool] calling %s(%s)", tc.Function.Name, tc.Function.Arguments)
		}

		// Execute tools and build follow-up messages
		followUp := append(messages, Message{
			Role:      "assistant",
			Content:   nil,
			ToolCalls: toolCalls,
		})
		for _, tc := range toolCalls {
			result := executeTool(tc.Function.Name, tc.Function.Arguments)
			log.Printf("[tool] result: %s", result)
			followUp = append(followUp, Message{
				Role:       "tool",
				Content:    result,
				ToolCallID: tc.ID,
			})
		}

		// Stream follow-up response (recursive, no tools for second call)
		doStreamNoTools(w, followUp, model, enableThinking, apiKey)
		return
	}

	// Normal finish — send [DONE]
	fmt.Fprintf(w, "data: [DONE]\n\n")
	w.Flush()
	log.Printf("[chat] stream done")
}

// Second-pass stream (after tool execution) — no tools to avoid infinite loop
func doStreamNoTools(w *bufio.Writer, messages []Message, model string, enableThinking *bool, apiKey string) {
	payload := APIPayload{
		Model:          model,
		Messages:       messages,
		Temperature:    0.2,
		Stream:         true,
		EnableThinking: enableThinking,
	}

	body, _ := json.Marshal(payload)

	httpReq, _ := http.NewRequest("POST", apiURL, bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		sendSSE(w, "error", `{"message":"follow-up request failed"}`)
		return
	}
	defer resp.Body.Close()

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		fmt.Fprintf(w, "%s\n\n", line)
		w.Flush()
	}
	log.Printf("[chat] follow-up stream done")
}

func sendSSE(w *bufio.Writer, event, data string) {
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data)
	w.Flush()
}
