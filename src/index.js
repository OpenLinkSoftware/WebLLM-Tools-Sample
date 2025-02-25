import * as webllm from "https://unpkg.com/@mlc-ai/web-llm@0.2.78";
import { marked } from "https://unpkg.com/marked@15.0.7/lib/marked.esm.js";
import DOMPurify from "https://unpkg.com/dompurify@3.2.4/dist/purify.es.mjs";


const llm_template =
 'You are Qwen, created by Alibaba Cloud. You are a helpful assistant.\n\n'
+'# Tools\n\n'
+'You may call one or two functions to assist with the user query.\n\n'
+'You are provided with function signatures within <tools></tools> XML tags:\n'
+'<tools>\n'
+'#{functions}\n'
+'</tools>\n\n'
+'For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:\n'
+'<tool_call>\n'
+'{"name": <function-name>, "arguments": <args-json-object>}\n'
+'</tool_call>\n'

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
      description: "Execute a SPARQL select query and fetch results"+
                   "Always use this if the user is asking for execute a SPARQL select query. "+
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

const system_prompt = llm_template.replace('#{functions}', JSON.stringify(tools, '\n', 2));


function render(text) {
  return DOMPurify.sanitize(marked.parse(text));
}

/*************** WebLLM logic ***************/
const messages = [
  {
//    content: "You are a helpful AI agent helping users.",
    content: system_prompt,
    role: "system",
  },
];
let tool_call_id=0;


const availableModels = webllm.prebuiltAppConfig.model_list
  .map((m) => m.model_id)
  .filter((model_id) => model_id.startsWith('Qwen2.5-'));

let selectedModel = "Qwen2.5-7B-Instruct-q4f32_1-MLC";

// Callback function for initializing progress
function updateEngineInitProgressCallback(report) {
  console.log("initialize", report.progress);
  document.getElementById("download-status").textContent = report.text;
}


// Create engine instance
const engine = new webllm.MLCEngine();
engine.setInitProgressCallback(updateEngineInitProgressCallback);

async function initializeWebLLMEngine() {
  document.getElementById("download-status").classList.remove("hidden");
  selectedModel = document.getElementById("model-selection").value;
  const config = {
    temperature: 1.0,
    top_p: 1,
    content_window_size: 8192,
//    sliding_window_size: 8192,
    prefill_chunk_size: 8192,
  };
  await engine.reload(selectedModel, config);
}

async function streamingGenerating(messages, onUpdate, onFinish, onError) {
  try {
    let curMessage = "";
    let usage;
    const completion = await engine.chat.completions.create({
      stream: true,
      messages,
      stream_options: { include_usage: true },
    });
    for await (const chunk of completion) {
      const curDelta = chunk.choices[0]?.delta.content;
      if (curDelta) {
        curMessage += curDelta;
      }
      if (chunk.usage) {
        usage = chunk.usage;
      }
      onUpdate(curMessage);
    }
    const finalMessage = await engine.getMessage();
    messages.push({content:finalMessage, role:"assistant"});

    //Qwen2.5
    let isToolCall = false;
    if (finalMessage.startsWith("<tool_call>")) {
      const tool_call = finalMessage.replace("<tool_call>", "").replace("</tool_call>", "");
      try {
        const func = JSON.parse(tool_call);
        onFinish("**func call:** "+tool_call, usage);
        return {done: false, tool_call: func, tool_role:"user"}; // Qwen2 role=user
      } catch(e) {
        console.log(e);
      }
    }
    else if (finalMessage.startsWith("```json")) { 
      const tool_call = finalMessage.replace(/^```json\n?\s*/, "").replace(/\s*\n?```$/, "");
      try {
        const func = JSON.parse(tool_call);
        onFinish("**func call:** "+tool_call, usage);
        return {done: false, tool_call: func, tool_role:"user"}; // Qwen2-Coder role=tool
      } catch(e) {
        console.log(e);
      }
    }

    onFinish(finalMessage, usage);
  } catch (err) {
    onError(err);
  }
  return {done: true};
}

/*************** UI logic ***************/
async function onMessageSend() {
  const input = document.getElementById("user-input").textContent.trim();
  const message = {
    content: input,
    role: "user",
  };
  if (input.length === 0) {
    return;
  }
  document.getElementById("send").disabled = true;

  messages.push(message);
  appendMessage(message);

  document.getElementById("user-input").value = "";
  document
    .getElementById("user-input")
    .setAttribute("placeholder", "Generating...");

  let done = false;

  while(!done) {
    document.getElementById("send").disabled = true;

    const aiMessage = {
      content: "typing...",
      role: "assistant",
    };

    appendMessage(aiMessage);

    const onFinishGenerating = (finalMessage, usage) => {
      updateLastMessage(finalMessage);
      document.getElementById("send").disabled = false;
      const usageText =
        `prompt_tokens: ${usage.prompt_tokens}, ` +
        `completion_tokens: ${usage.completion_tokens}, ` +
        `prefill: ${usage.extra.prefill_tokens_per_s.toFixed(4)} tokens/sec, ` +
        `decoding: ${usage.extra.decode_tokens_per_s.toFixed(4)} tokens/sec`;
      document.getElementById("chat-stats").classList.remove("hidden");
      document.getElementById("chat-stats").textContent = usageText;
    };

    const rc = await streamingGenerating(
                   messages,
                   updateLastMessage,
                   onFinishGenerating,
                   console.error,
               );

    done = rc.done;

    if (!done) {
       const tool_role = rc.tool_role;
       const tool_call = rc.tool_call;

       const aiMessage = {content: "working...", role: "assistant"};
       appendMessage(aiMessage);

       let content = "";

       if (tool_call && tool_call.name === "fetch_wikipedia_content") {
          const ret = await fetch_wikipedia_content(tool_call.arguments.search_query);
          content = JSON.stringify(ret);
       } 
       else if (tool_call && tool_call.name === "sparql_exec") {
          const ret = await sparql_exec(tool_call.arguments.query);
          content = JSON.stringify(ret);
       } 
       else {
          content = 'Error: Unknown function '+tool_call?.name
       }
       
       const ret_data = `<tool_response>\n{name:${tool_call.name}, content:${content} }\n</tool_response>`;
       messages.push({
                 content: ret_data, 
                 tool_call_id, 
                 role:tool_role});
       tool_call_id++;
       updateLastMessage("**func result:** "+ret_data);
    }
//    console.log(messages);
//    console.log("------")
  }
}

function appendMessage(message) {
  const chatBox = document.getElementById("chat-box");
  const container = document.createElement("div");
  container.classList.add("message-container");
  const newMessage = document.createElement("div");
  newMessage.classList.add("message");

  if (message.role === "user") {
    container.classList.add("user");
    newMessage.textContent = message.content;
  } else {
    container.classList.add("assistant");
    newMessage.classList.add("markdown");
    newMessage.innerHTML = render(message.content);
  }

  container.appendChild(newMessage);
  chatBox.appendChild(container);
  chatBox.scrollTop = chatBox.scrollHeight; // Scroll to the latest message
}

function updateLastMessage(content) {
  const messageDoms = document.querySelectorAll("#chat-box div.message");
  const lastMessageDom = messageDoms[messageDoms.length - 1];
  lastMessageDom.innerHTML = render(content);
}

/*************** UI binding ***************/
availableModels.forEach((modelId) => {
  const option = document.createElement("option");
  option.value = modelId;
  option.textContent = modelId;
  document.getElementById("model-selection").appendChild(option);
});
document.getElementById("model-selection").value = selectedModel;
document.getElementById("download").addEventListener("click", async function () {
  try {
    const gpuVendor = await engine.getGPUVendor();
  } catch(e) {
    alert(e);
    return;
  }
  await initializeWebLLMEngine();
  document.getElementById("send").disabled = false;
  document.getElementById("download").disabled = true;
});
document.getElementById("send").addEventListener("click", function () {
  onMessageSend();
});


/****** TOOLS code **************************/
async function fetch_wikipedia_content(searchQuery)
{
    /** Fetches Wikipedia content for a given searchQuery */
    try {
        // Search for the most relevant article
        const wikiUrl = "https://en.wikipedia.org/w/api.php";
        let params = new URLSearchParams({
            action: "query",
            format: "json",
            list: "search",
            srsearch: searchQuery,
            srlimit: 1,
            origin: "*",
        });

        let rc = await fetch(`${wikiUrl}?${params.toString()}`);
        const searchData = await rc.json();

        if (!searchData.query.search) {
            return {
                status: "error",
                message: `No Wikipedia article found for '${searchQuery}'`,
            };
        }

        // Get the normalized title from search results
        const normalizedTitle = searchData.query.search[0].title;

        // Now fetch the actual content with the normalized title
        params = new URLSearchParams({
            action: "query",
            format: "json",
            titles: normalizedTitle,
            prop: "extracts",
            exintro: "true",
            explaintext: "true",
            redirects: 1,
            origin: "*",
        });

        rc = await fetch(`${wikiUrl}?${params.toString()}`);
        const data = await rc.json();

        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];

        if (pageId === "-1") {
            return {
                status: "error",
                message: `No Wikipedia article found for '${searchQuery}'`,
            };
        }

        const content = pages[pageId].extract.trim();
        return {
            status: "success",
            content: content,
            title: pages[pageId].title,
        };

    } catch (error) {
        return {
            status: "error",
            message: error.message,
        };
    }
}


const endpoint = "https://linkeddata.uriburner.com/sparql/?format=application%2Fsparql-results%2Bjson&timeout=30000&maxrows=15"

async function sparql_exec(query) {
  const url = new URL(endpoint);
  url.searchParams.append('query', query);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/sparql-results+json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const results = await response.json();
    return results;
  } catch (ex) {
    console.error('Error executing SPARQL query:', ex);
    return {error: ex.toString()}
  }
}