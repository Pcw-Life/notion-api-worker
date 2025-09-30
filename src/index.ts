import { WorkflowEntrypoint } from 'cloudflare:workers';

export interface Env {
  NOTION_TOKEN: string;          // Cloudflare secret
  NOTION_DATABASE_ID: string;    // Cloudflare secret
  NOTION_API_BASE: string;       // Cloudflare secret
}

async function fetchWithRetry(input: RequestInfo, init: RequestInit, attempts = 3, baseDelayMs = 250) {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(input, init);
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, i)));
  }
  throw lastErr;
}

export class APIDocumentationWorkflow extends WorkflowEntrypoint<Env> {
  async run(event: any, step: any) {
    const pageId = event?.payload?.pageId;
    if (!pageId) throw new Error('Missing pageId in event payload');

    console.log(JSON.stringify({ step: 'start', pageId }));

    const pageContent = await step.do('fetch-page-content', async () => {
      const res = await fetchWithRetry(`${this.env.NOTION_API_BASE}/pages/${pageId}`, {
        headers: {
          Authorization: `Bearer ${this.env.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      });
      return res.json();
    });

    const extractedAPIs = await step.do('parse-api-content', async () => {
      const parser = new APIDocumentationParser();
      return parser.parseContent(pageContent);
    });

    console.log(JSON.stringify({ step: 'parsed', count: extractedAPIs.length }));

    await step.do('update-api-database', async () => {
      for (const api of extractedAPIs) {
        const res = await fetchWithRetry(`${this.env.NOTION_API_BASE}/pages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.env.NOTION_TOKEN}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            parent: { database_id: this.env.NOTION_DATABASE_ID },
            properties: {
              Name: { title: [{ text: { content: api.name } }] },
              Method: { select: { name: api.method } },
              Endpoint: { rich_text: [{ text: { content: api.endpoint } }] },
              Status: { select: { name: 'Active' } },
              Description: { rich_text: [{ text: { content: api.description } }] }
            }
          })
        });
        if (!res.ok) throw new Error(`Notion create page failed: ${res.status}`);
      }
    });

    console.log(JSON.stringify({ step: 'done', pageId }));
  }
}

class APIDocumentationParser {
  parseContent(content: any) {
    const apis: any[] = [];
    const blocks = content?.blocks || [];
    let currentAPI: any | null = null;

    for (const block of blocks) {
      if (block.type === 'heading_1' || block.type === 'heading_2') {
        if (currentAPI) apis.push(currentAPI);
        currentAPI = {
          name: this.extractAPIName(block),
          method: this.extractMethod(block),
          endpoint: this.extractEndpoint(block),
          description: '',
          parameters: [],
          requestBody: null,
          responseFormat: null,
          authentication: null
        };
      }
      if (currentAPI && block.type === 'paragraph') {
        currentAPI.description += this.extractText(block);
      }
      if (currentAPI && block.type === 'code') {
        this.processCodeBlock(currentAPI, block);
      }
    }
    if (currentAPI) apis.push(currentAPI);
    return apis;
  }
  extractAPIName(block: any) {
    const text = this.extractText(block);
    return text.replace(/^(GET|POST|PUT|DELETE|PATCH)\s+/i, '').trim();
  }
  extractMethod(block: any) {
    const text = this.extractText(block);
    const m = text.match(/^(GET|POST|PUT|DELETE|PATCH)\s+/i);
    return m ? m[1].toUpperCase() : 'GET';
  }
  extractEndpoint(block: any) {
    const text = this.extractText(block);
    const m = text.match(/\/([\w\/-]+)/);
    return m ? m[0] : '';
  }
  extractText(block: any) {
    if (block.text) return block.text;
    if (block.paragraph?.text) return block.paragraph.text.map((t: any) => t.plain_text).join('');
    if (block.heading_1?.text) return block.heading_1.text.map((t: any) => t.plain_text).join('');
    if (block.heading_2?.text) return block.heading_2.text.map((t: any) => t.plain_text).join('');
    return '';
  }
  processCodeBlock(api: any, block: any) {
    const language = block.code.language;
    const text = block.code.text.map((t: any) => t.plain_text).join('');
    if (language === 'json' && text.includes('"parameters"')) {
      api.parameters = this.parseJSONParameters(text);
    } else if (language === 'json' && text.includes('"body"')) {
      api.requestBody = text;
    } else if (language === 'json') {
      api.responseFormat = text;
    }
  }
  parseJSONParameters(text: string) {
    try {
      const json = JSON.parse(text);
      return json.parameters || [];
    } catch {
      return [];
    }
  }
}
