import * as webllm from "https://unpkg.com/@mlc-ai/web-llm@0.2.78";
import { marked } from "https://unpkg.com/marked@15.0.7/lib/marked.esm.js";
import DOMPurify from "https://unpkg.com/dompurify@3.2.4/dist/purify.es.mjs";


const rules = 
{
    "query_processing_config": {
        "name": "OpenLink Data Twingler",
        "version": "0.0.1",
        "features": {
            "query_optimization": {
                "SPARQL": {
                    "max_results": "10",
                    "example_query": "SELECT DISTINCT (SAMPLE(?s) AS ?entitySample) (COUNT(*) AS ?count) (?o as ?entityType) WHERE {?s a ?o} GROUP BY ?o ORDER BY DESC (?count) LIMIT 10",
                    "example_query1": "SELECT (SAMPLE(?s) AS ?entitySample)  (?o as ?entityType) WHERE {?s a ?o} LIMIT 10",
                },
                "SPARQL-FED": {
                    "service_block_limit": "10",
                    "service_block_order_by": true,
                    "query_pattern": "<NAMSPACE PREFIX DECLARATIONS> <SPARQL-SELECT-LIST> WHERE { SERVICE <SPARQL-ENDPOINT-URL> { <SPARQL-SELECT-LIST> WHERE <SPARQL-BODY> } } ",
                    "example_query": "PREFIX dbr: <http://dbpedia.org/resource/> PREFIX dbo: <http://dbpedia.org/ontology/> SELECT * WHERE { SERVICE <http://dbpedia.org/sparql> { ?movie rdf:type dbo:Film ; dbo:director dbr:Spike_Lee . } }",
                },
            },
            "error_handling": {
                "log_errors": true,
                "error_reporting_level": "detailed"
            },
        },
        "rules": [
            "The Query Processing Configuration Agent must ensure that query processing settings are optimized for performance and accuracy.",
            "The agent must handle errors gracefully and provide detailed feedback for troubleshooting.",
        ],
        "preferences": {
            "interaction_style": "Friendly and professional",
            "knowledge_depth": "Deep and comprehensive",
            "response_speed": "As quick as possible without compromising accuracy",
            "sparqlEndpointPromptBehavior": "If a SPARQL endpoint is mentioned in a prompt, treat the query as a SPARQL-FED query and use the mentioned endpoint in addition to the default endpoint.",
            "sparqlProcessingBehavior": "Set the default SPARQL endpoint, unless instructed otherwise, to https://linkeddata.uriburner.com/sparql; tabulate query results; limit results to 10, unless instructed otherwise.",
            "sparqlEndpointDesignationBehavior": "When a SPARQL endpoint is designated in a prompt, it implies that more than one endpoint is involved. The designated endpoint is used in addition to the default endpoint.",
            "sparqlFedProcessingBehavior": "Whenever I request a SPARQL query to be executed with a designated endpoint, treat the request as a SPARQL-FED request where the designated endpoint is used for the SERVICE associated with the designated query. The SERVICE block must comprise a SELECT Query with a LIMIT clause applied within the SERVICE block itself. This ensures that the limit is applied at the remote endpoint. Also, apply ORDER BY clauses where applicable.",
            "spasqlProcessingBehavior": "Construct SPASQL queries using the pattern: <SQL SELECT LIST where each item matches a SPARQL SELECT LIST variable> FROM (SPARQL prepended to <SPARQL-SELECT-LIST> WHERE <SPARQL-BODY>) AS <ALIAS> ",
            "spasqlFedProcessingBehavior": "Construct SPASQL queries using the pattern: <SQL SELECT LIST where each item matches a SPARQL SELECT LIST variable> FROM (SPARQL prepended to <SPARQL-SELECT-LIST> WHERE <SPARQL-BODY-WITH-SERVICE-IN-WHERE-CLAUSE>) AS <ALIAS> ",
            "queryResultsTabulation": "Tabulate query results by default for SPARQL, SPASQL, SQL, and GraphQL."
        }
    },
    "init": "As the Query Processing Configuration Agent, you should inform the user of the current query processing settings and be ready to accept commands to update or test these settings. If the user requests changes, guide them through the process and confirm the updates. Always be prepared to provide expert advice on optimizing query performance."
}




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
      description: "Execute a SPARQL or SPARQL-FED select query and fetch results"+
                   "Always use this if the user is asking for execute a SPARQL or SPARQL-FED select query. "+
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


function render(text) {
  return DOMPurify.sanitize(marked.parse(text));
}

/*************** WebLLM logic ***************/
const messages = [];
let tool_handler=null;

// Callback function for initializing progress
function updateEngineInitProgressCallback(report) {
  console.log("initialize", report.progress);
  document.getElementById("download-status").textContent = report.text;
}


// Create engine instance
const engine = new webllm.MLCEngine();
engine.setInitProgressCallback(updateEngineInitProgressCallback);

async function initializeWebLLMEngine() {
  document.getElementById("user-input").textContent = 'Write and execute a sample SPARQL query'
  document.getElementById("download-status").classList.remove("hidden");
  selectedModel = document.getElementById("model-selection").value;
  const config = {
    temperature: 0.6,
    top_p: 0.9,
    context_window_size: -1,
    sliding_window_size: 8192,
    prefill_chunk_size: 8192,
    attention_sink_size: 4096
  };
  await engine.reload(selectedModel, config);

  tool_handler = new ToolHanler(selectedModel);
  messages.push({role:"system", content:tool_handler.createSystemPrompt(tools)});
}

async function streamingGenerating(messages, onUpdate, onFinish, onError) {
  try {
    let curMessage = "";
    let usage;
    const completion = await engine.chat.completions.create({
      seed: 0,
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

    //Handle Tools
    let isToolCall = false;
    if (tool_handler) {
       const rc = tool_handler.checkResponse(finalMessage);
       if (rc) {
         if (!rc.error) {
           if (rc.end) {
             const aiMessage = {content: "working...", role: "assistant"};
             appendMessage(aiMessage);
           }
           onFinish("**func call:** "+rc.tool_call, usage);
           return {done: false, func: rc.func};
         } 
         else {
           onFinish(finalMessage+"\n"+"Error: "+rc.error, usage);
           return {done: false, func: rc.func, error:rc.error};
         }
       }
    }

    onFinish(finalMessage, usage);
  } catch (err) {
    onError(err);
  }
  return {done: true};
}

/*************** UI logic ***************/
const availableModels = webllm.prebuiltAppConfig.model_list
  .map((m) => m.model_id)
  .filter((model_id) => (
  	   model_id.startsWith('Qwen2.5-7B')
//  	|| model_id.startsWith('Hermes-2-Pro-Llama')
  	|| model_id.startsWith('Hermes-3-Llama-3.1')
  	|| (model_id.startsWith('Llama-3.1-8B-') && !model_id.endsWith('-1k'))
//        || model_id.startsWith('DeepSeek-R1-Distill-Llama-')
  ));

let selectedModel = "Llama-3.1-8B-Instruct-q4f16_1-1k";
//let selectedModel = "Qwen2.5-7B-Instruct-q4f16_1-MLC";

async function onMessageStop() {
  engine.interruptGenerate();
}

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
  document.getElementById("stop").disabled = false;

  messages.push(message);
  appendMessage(message);

  document.getElementById("user-input").value = "";
  document
    .getElementById("user-input")
    .setAttribute("placeholder", "Generating...");

  let done = false;
  let iter = 0;
  while(!done && iter < 3) {
    iter++;
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

    if (!done && tool_handler) {
       if (rc.error) {
         messages.push({
                 content: 'Error: '+rc.error,
                 tool_call_id: 0,
                 role: 'user'});
       }
       else {
         const func = rc.func;

         const aiMessage = {content: "working...", role: "assistant"};
         appendMessage(aiMessage);

         let toolResp = null;

         try {
           if (func && func.name === "fetch_wikipedia_content") {
             const ret = await fetch_wikipedia_content(func.arguments.search_query);
             toolResp = tool_handler.genToolResponse(func, JSON.stringify(ret));
           } 
           else if (func && func.name === "sparql_exec") {
             const ret = await sparql_exec(func.arguments.query);
             toolResp = tool_handler.genToolResponse(func, JSON.stringify(ret));
           } 
           else {
             const content = 'Error: Unknown function '+func?.name;
             toolResp = tool_handler.genToolResponse(func, JSON.stringify(content));
           }

         } catch (e) {
            const content = 'Error: '+e.toString()
            toolResp = tool_handler.genToolResponse(func, JSON.stringify(content));
         }

         messages.push({
                 content: toolResp.content,
                 tool_call_id: toolResp ? toolResp.tool_call_id : 0,
                 role: toolResp.role});
         updateLastMessage("**func result:** "+toolResp.content);
       }
  
    }
  }
  document.getElementById("stop").disabled = true;
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
document.getElementById("stop").addEventListener("click", function () {
  onMessageStop();
});


/***********************************************/

class ToolHanler {
  qwen_template =
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
+'You are a helpful Assistant.\n'
+'Do not generate function results.\n'
+'Always do real call of functions, when it is required.\n'
+'Execute only one function per time.\n';


  hermes2_template =
 `You are a function calling AI model. You are provided with function signatures within <tools></tools> XML tags.`
+` You may call one or more functions to assist with the user query. `
+`Don't make assumptions about what values to plug into functions. Here are the available tools: <tools>\n`
+' #{functions} \n\n'
+` </tools>.\n Use the following pydantic model json schema for each tool call you will make:`
+` {"properties": {"arguments": {"title": "Arguments", "type": "object"}, "name": {"title": "Name", "type": "string"}}, "required": ["arguments", "name"], "title": "FunctionCall", "type": "object"} `
+`For each function call return a json object with function name and arguments within <tool_call></tool_call> XML tags as follows:\n`
+`<tool_call>\n{"arguments": <args-dict>, "name": <function-name>}\n</tool_call>\n`
+'You are a helpful Assistant.\n'
+'Do not generate function results.\n'
+'Always do real call of functions, when it is required.\n'
+'Execute only one function per time.\n';



  hermes3_template =
 `You are a function calling AI model. You are provided with function signatures within <tools></tools> XML tags. `
+`You may call one or more functions to assist with the user query. `
+`Don't make assumptions about what values to plug into functions. Here are the available tools: <tools> \n`
+` #{functions} \n`
+` </tools>\n`
+`Use the following pydantic model json schema for each tool call you will make:`
+` {"properties": {"name": {"title": "Name", "type": "string"}, "arguments": {"title": "Arguments", "type": "object"}}, "required": ["name", "arguments"], "title": "FunctionCall", "type": "object"}}\n\n`
+`For each function call return a json object with function name and arguments within <tool_call></tool_call> XML tags as follows:\n\n`
+`<tool_call>\n{"name": <function-name>, "arguments": <args-dict>}\n</tool_call>\n\n`
+'You are a helpful Assistant.\n'
+'Do not generate function results.\n'
+'Always do real call of functions, when it is required.\n'
+'Execute only one function per time\n';




  llama32_template =
 'Environment: ipython\n'
+'Cutting Knowledge Date: December 2023\n'
+'Today Date: 26 Jul 2024\n\n'
+'Given the following functions, please respond with a JSON for a function call with its proper arguments that best answers the given prompt.\n\n'
+'Respond in the format\n <tool_call>\n{"name": function name, "parameters": dictionary of argument name and its value}\n</tool_call> .\n\n'
//+'Respond in the format {"name": function name, "parameters": dictionary of argument name and its value}.'
+'Do not use variables.\n\n'
+'#{functions}\n\n'
+'You are a helpful Assistant.\n'
+'Do not generate function results.\n'
+'Always do real call of functions, when it is required.\n'
+'Execute only one function per time.\n';



  llama31_template =
// 'Environment: ipython\n'
 'Cutting Knowledge Date: December 2023\n'
+'Today Date: 23 Jul 2024\n\n'
+'# Tool Instructions\n'
+'- When looking for real time information use relevant functions if available\n'
+'You have access to the following functions:\n'
+'#{functions}\n'
+'If a you choose to call a function ONLY reply in the following format:\n'
+'  <function>{"name": function name, "parameters": dictionary of argument name and its value}</function>\n'
+'Here is an example,\n'
+'  <function>{"name": "example_function_name", "parameters": {"example_name": "example_value"}}</function>\n'
+'Reminder:\n'
+'- Function calls MUST follow the specified format and use BOTH <function> and </function>\n'
+'- Required parameters MUST be specified\n'
+'- Only call one function at a time\n'
+'- When calling a function, do NOT add any other words, ONLY the function calling\n'
+'- Put the entire function call reply on one line\n'
+'- Always add your sources when using search results to answer the user query\n'
+'You are a helpful Assistant.\n'
+'Do not generate function results.\n'
+'Always do real call of functions, when it is required.\n'
+'Execute only one function per time.\n';
  
   deepseek_template =
 'Cutting Knowledge Date: December 2023\n'
+'Today Date: 23 Jul 2024\n\n'
+'# Tool Instructions\n'
+'- When looking for real time information use relevant functions if available\n'
+'You have access to the following functions:\n\n'
+'#{functions}\n'
+'If a you choose to call a function ONLY reply in the following format:\n'
+'  <tool_call>{"name": function name, "parameters": dictionary of argument name and its value}</tool_call>\n'
+'Here is an example,\n'
+'  <tool_call>{"name": "example_function_name", "parameters": {"example_name": "example_value"}}</tool_call>\n'
+'Reminder:\n'
+'- Function calls MUST follow the specified format and use BOTH <tool_call> and </tool_call>\n'
+'- Required parameters MUST be specified\n'
+'- Only call one function at a time\n'
+'- When calling a function, do NOT add any other words, ONLY the function calling\n'
+'- Put the entire function call reply on one line\n'
+'- Always add your sources when using search results to answer the user query\n'
+'You are a helpful Assistant.\n'
+'Do not generate function results.\n'
+'Always do real call of functions, when it is required\n'
+'Execute only one function per time\n';

  rexp_tool_call = /<tool_call>[\s\S]*<\/tool_call>$/;
  rexp_function = /<function>[\s\S]*<\/function>$/;

  constructor(model_id) {
    if (model_id.startsWith('Qwen2.5'))
      this.mode = 'qwen';
    else if (model_id.startsWith('Hermes-2-Pro-'))
      this.mode = 'hermes2_llama'
    else if (model_id.startsWith('Hermes-3-Llama'))
      this.mode = 'hermes3_llama'
    else if (model_id.startsWith('Llama-3.1-'))
      this.mode = 'llama31'
    else if (model_id.startsWith('Llama-3.2-'))
      this.mode = 'llama32'
    else if (model_id.startsWith('DeepSeek-R1-Distill-Llama'))
      this.mode = 'deepseek'
    else
      this.mode = 'llama31';
    this.tool_call_id=0;
  }
  
  createSystemPrompt(tools) {
    let sys_template = "";
    let funcs = "";
    for(const t of tools)
       funcs += JSON.stringify(t, '\n', 2)+'\n\n';

    if (this.mode==='qwen')
//      return this.qwen_template.replace('#{functions}', JSON.stringify(tools, '\n', 2));
      sys_template = this.qwen_template.replace('#{functions}', funcs);
    else if (this.mode==='hermes2_llama')
      sys_template = this.hermes2_template.replace('#{functions}', funcs);
    else if (this.mode==='hermes3_llama')
      sys_template = this.hermes2_template.replace('#{functions}', funcs);
    else if (this.mode==='llama31')
      sys_template = this.llama31_template.replace('#{functions}', funcs);
    else if (this.mode==='llama32')
      sys_template = this.llama32_template.replace('#{functions}', funcs);
    else if (this.mode==='deepseek')
      sys_template = this.deepseek_template.replace('#{functions}', funcs);

    return sys_template + `\n\n\n ${JSON.stringify(rules, '\n', 2)}\n\n`
  }

  checkResponse(str) {
    let tool_call = null;
    let is_end = false;

    str = str.trim();
    const tool_end = str.match(this.rexp_tool_call);
    const function_end = str.match(this.rexp_function);


    if (this.mode==='qwen' || this.mode==='hermes2_llama' || this.mode==='hermes3_llama') {
      if (str.startsWith("<tool_call>")) {
        tool_call = str.replace("<tool_call>", "").replace("</tool_call>", "");
      }
      else if (tool_end) {
        tool_call = tool_end[0].replace("<tool_call>", "").replace("</tool_call>", "");
        is_end = true;
      }
    }
    else if (this.mode==='llama32') {
      if (str.startsWith("<tool_call>") || str.startsWith("<|python_tag|>") || str.startsWith("{")) {
        tool_call = str.replace(/^\<\|python_tag\|\>\n?\s*/, "").replace("<tool_call>", "").replace("</tool_call>", "");
      }
      else if (tool_end) {
        tool_call = tool_end[0].replace(/^\<\|python_tag\|\>\n?\s*/, "").replace("<tool_call>", "").replace("</tool_call>", "");
        is_end = true;
      }
    }
    else if (this.mode==='llama31') {
      if (str.startsWith("<function>")) {
        tool_call = str.replace("<function>", "").replace("</function>", "");
      }
      else if (function_end) {
        tool_call = function_end[0].replace("<function>", "").replace("</function>", "");
        is_end = true;
      }
    }
    else if (this.mode==='deepseek') {
      const message = str.replace(/<think>.*?<\/think>/s, "").trim();
      if (message.startsWith("<tool_call>")) {
        tool_call = message.replace("<tool_call>", "").replace("</tool_call>", "");
      }
      else if (tool_end) {
        tool_call = tool_end[0].replace("<tool_call>", "").replace("</tool_call>", "");
        is_end = true;
      }
    }

    if (tool_call) {
      try {
        const func = JSON.parse(tool_call);
        if (func.parameters)
          func["arguments"] = func.parameters;
        return {func, tool_call, is_end};
      } catch(e) {
        console.log(e);
        return {error: e.toString()}
      }
    }
    return null;
  }

  genToolResponse(func, ret) {
    let rc = null;
    if (this.mode==='qwen') {
      const content = `<tool_response>\n{name:${func.name}, content:${ret} }\n</tool_response>`
      rc = {content, tool_call_id: this.tool_call_id, role:'user'}; // Qwen2 role=user
      this.tool_call_id++;
    }
    else if (this.mode==='deepseek') {
      const content = `<tool_response>\n{name:${func.name}, content:${ret} }\n</tool_response>`
      rc = {content, tool_call_id: this.tool_call_id, role:'user'}; // DeepSeek role=user
      this.tool_call_id++;
    }
    else {
      const content = `<tool_response>\n{name:${func.name}, content:${ret} }\n</tool_response>`
      rc = {content, tool_call_id: this.tool_call_id, role:'tool'};
    }
    this.tool_call_id++;
    return rc;
  }
}

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
      let res = ""
      try {
        res = await response.text();
      } catch (_) {}
      throw new Error(`HTTP error! Status: ${response.status}\n ${res}`);
    }

    const results = await response.json();
    return results;
  } catch (ex) {
    console.error('Error executing SPARQL query:', ex);
    return {error: ex.toString()}
  }
}