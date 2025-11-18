# WebLLM-Tools-Sample
Sample of using tools with WebLLM 
(Note it works only in browsers with WebGPU support and you must have:
- Qwen3-1.7B at last 2Gb of free VRAM
- Qwen3-4B at last 4Gb of free VRAM
).
Tested on Chrome and Brave on MSWindows and macOS

[Demo App](https://openlinksoftware.github.io/WebLLM-Tools-Sample/src/index.html)

```js
const tools = [
  {
    type: "function",
    function: {
      name: "fetch_wikipedia_content",
      description: "Search Wikipedia and fetch the introduction of the most relevant article. "+
                   "Always use this if the user is asking for something that is likely on wikipedia. "+
                   "If the user has a typo in their search query, correct it before searching.",
      parameters: {
        type: "object",
        properties: {
            type: "object",
            properties: {
                search_query: {
                    type: "string",
                    description: "Search query for finding the Wikipedia article"
                }
            },
        },
        required: ["search_query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sparql_exec",
      description: "Execute any SPARQL select queries and fetch results"+
                   "Always use this if the user is asking for execute some SPARQL select query. "+
                   "If the user has a typo in their SPARQL select query, correct it before executing.",
      parameters: {
        type: "object",
        properties: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "SPARQL select query"
                }
            },
        },
        required: ["query"],
      },
      "return": {
        "type": "object",
        "description": "A data in application/sparql-results+json format"
      }
    },
  },
  ];
```

Sample of using tool calls with Web LLM.
Now it works with next model:
- Qwen3-8B
- Qwen3-4B
- Qwen3-1.7B
- Qwen2.5-7B-Instruct
- Qwen2.5-14B-Instruct
- Llama-3.1-8B-Instruct
- Hermes-3-Llama-3.1-8B

Best results is with `Qwen3-8B`, `Qwen2.5-14b`, `Qwen3-4B` , `Qwen3-1.7B` (for Linux use models with suffix **q4f32**)


