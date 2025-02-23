# WebLLM-Tools-Sample
Sample of using tools with WebLLM (Note it works only in browsers with WebGPU support and you must have at last 4Gb of free VRAM).
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
  ];
```

Sample of using tool calls with Web LLM.
Now sample supports only Qwen2.5-* LLM models

Main testing was with `Qwen2.5-3B-Instruct-q1416_1-MLC` https://huggingface.co/mlc-ai/Qwen2.5-3B-Instruct-q4f16_1-MLC

