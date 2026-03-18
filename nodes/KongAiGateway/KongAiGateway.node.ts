import type {
  ICredentialsDecrypted,
  ICredentialDataDecryptedObject,
  ICredentialTestFunctions,
  INodeCredentialTestResult,
  INodeType,
  INodeTypeDescription,
  ISupplyDataFunctions,
  SupplyData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { ChatOpenAI } from '@langchain/openai';

export class KongAiGateway implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Kong AI Gateway Model',
    name: 'kongAiGateway',
    icon: 'file:kong.svg',
    group: ['transform'],
    version: 1,
    description: 'Use Kong AI Gateway as the LLM for an AI Agent',
    defaults: { name: 'Kong AI Gateway Model' },
    codex: {
      categories: ['AI'],
      subcategories: {
        AI: ['Language Models'],
        'Language Models': ['Chat Models (Recommended)'],
      },
      resources: {
        primaryDocumentation: [
          { url: 'https://docs.konghq.com/hub/kong-inc/ai-proxy/' },
        ],
      },
    },
    inputs: [],
    outputs: [NodeConnectionTypes.AiLanguageModel],
    outputNames: ['Model'],
    credentials: [
      {
        name: 'kongAiGatewayApi',
        required: true,
        testedBy: 'testKongAiGatewayApiCredential',
      },
    ],
    properties: [
      {
        displayName: 'Model',
        name: 'model',
        type: 'string',
        default: 'gpt-4o',
        placeholder: 'Enter model name, e.g. gpt-4o',
        description:
          'The model name as configured in your Kong AI Gateway route.',
        required: true,
      },
      {
        displayName: 'Streaming',
        name: 'streaming',
        type: 'boolean',
        default: true,
        description:
          'Whether to stream token-by-token (true) or wait for the full response (false).',
      },
      {
        displayName: 'Temperature',
        name: 'temperature',
        type: 'number',
        default: 1,
        typeOptions: { minValue: 0, maxValue: 2, numberStepSize: 0.1 },
      },
      {
        displayName: 'Max Tokens',
        name: 'maxTokens',
        type: 'number',
        default: '',
        typeOptions: { minValue: 1 },
        description: 'Leave empty to use the model default.',
      },
      {
        displayName: 'Top P',
        name: 'topP',
        type: 'number',
        default: '',
        typeOptions: { minValue: 0, maxValue: 1, numberStepSize: 0.01 },
        description: 'Leave empty to use the model default.',
      },
      {
        displayName: 'Kong Route Path',
        name: 'kongRoutePath',
        type: 'string',
        default: '',
        placeholder: '/openai',
        description:
          'Optional path appended to the base URL, e.g. /openai. A leading slash is added automatically if missing.',
      },
      {
        displayName: 'Additional Headers',
        name: 'additionalHeaders',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        default: {},
        placeholder: 'Add Header',
        description:
          'Extra HTTP headers sent with every request. On key collision, these override credential-level auth headers.',
        options: [
          {
            name: 'headers',
            displayName: 'Header',
            values: [
              {
                displayName: 'Name',
                name: 'name',
                type: 'string',
                default: '',
                required: true,
                placeholder: 'X-Custom-Header',
              },
              {
                displayName: 'Value',
                name: 'value',
                type: 'string',
                default: '',
                required: true,
              },
            ],
          },
        ],
      },
    ],
  };

  // Credential test — registered via testedBy: 'testKongAiGatewayApiCredential'
  methods: INodeType['methods'] = {
    credentialTest: {
      async testKongAiGatewayApiCredential(
        this: ICredentialTestFunctions,
        credential: ICredentialsDecrypted<ICredentialDataDecryptedObject>,
      ): Promise<INodeCredentialTestResult> {
        // n8n >= 1.40 requires Node.js >= 18.17, so AbortSignal.timeout() is safe here.
        const baseUrl = (credential.data?.baseUrl as string | undefined) ?? '';
        if (!baseUrl) {
          return { status: 'Error', message: 'Base URL is required.' };
        }
        try {
          const response = await fetch(`${baseUrl.replace(/\/$/, '')}/`, {
            signal: AbortSignal.timeout(5000),
          });
          if (response.status >= 500) {
            return {
              status: 'Error',
              message: `Kong returned server error ${response.status} at ${baseUrl}`,
            };
          }
          return { status: 'OK', message: 'Connection successful.' };
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          return {
            status: 'Error',
            message: `Could not connect to Kong at ${baseUrl}: ${msg}`,
          };
        }
      },
    },
  };

  async supplyData(
    this: ISupplyDataFunctions,
    itemIndex: number,
  ): Promise<SupplyData> {
    // Step 1 — Load credentials
    const creds = await this.getCredentials('kongAiGatewayApi');
    const rawBase = creds.baseUrl as string;
    const authMethod = creds.authMethod as string;

    // Step 2 — Validate baseUrl
    if (!rawBase || rawBase.trim() === '') {
      throw new NodeOperationError(
        this.getNode(),
        'Kong AI Gateway: baseUrl is required',
      );
    }
    try {
      const parsed = new URL(rawBase);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('unsupported protocol');
      }
    } catch (_e: unknown) {
      throw new NodeOperationError(
        this.getNode(),
        'Kong AI Gateway: baseUrl must be a valid URL including protocol, e.g. https://kong.example.com',
      );
    }

    // Step 3 — Read node parameters
    const model = this.getNodeParameter('model', itemIndex) as string;
    const streaming = this.getNodeParameter('streaming', itemIndex) as boolean;
    const temperature = this.getNodeParameter('temperature', itemIndex) as number;
    const maxTokensRaw = this.getNodeParameter('maxTokens', itemIndex, '') as number | '';
    const topPRaw = this.getNodeParameter('topP', itemIndex, '') as number | '';
    const kongRoutePath = this.getNodeParameter('kongRoutePath', itemIndex, '') as string;
    const additionalHeadersParam = this.getNodeParameter(
      'additionalHeaders',
      itemIndex,
      {},
    ) as { headers?: Array<{ name: string; value: string }> };

    // Step 4 — Build authHeaders + resolvedApiKey
    // bearerToken is passed as ChatOpenAI's apiKey so the SDK generates
    // "Authorization: Bearer <token>" natively — avoids a header collision.
    // All other modes use 'kong' as a dummy apiKey (Kong ignores it).
    let authHeaders: Record<string, string> = {};
    let resolvedApiKey = 'kong';

    switch (authMethod) {
      case 'apiKey': {
        const headerName = ((creds.apiKeyHeader as string | undefined) ?? '').trim() || 'apikey';
        const keyValue = (creds.apiKey as string | undefined)?.trim() ?? '';
        if (!keyValue) {
          throw new NodeOperationError(this.getNode(), 'Kong AI Gateway: API Key is required');
        }
        authHeaders = { [headerName]: keyValue };
        break;
      }
      case 'bearerToken': {
        const token = (creds.bearerToken as string | undefined)?.trim() ?? '';
        if (!token) {
          throw new NodeOperationError(this.getNode(), 'Kong AI Gateway: Bearer Token is required');
        }
        resolvedApiKey = token;
        break;
      }
      case 'customHeader': {
        const customName = (creds.customHeaderName as string | undefined)?.trim() ?? '';
        if (!customName) {
          throw new NodeOperationError(
            this.getNode(),
            'Kong AI Gateway: Custom Header Name is required',
          );
        }
        authHeaders = { [customName]: creds.customHeaderValue as string };
        break;
      }
      // 'none' and default: authHeaders stays {}, resolvedApiKey stays 'kong'
    }

    // Step 5 — Merge additionalHeaders (extra headers win on key collision)
    const rawHeaders = additionalHeadersParam.headers ?? [];
    const extraHeaders = Object.fromEntries(rawHeaders.map(h => [h.name, h.value]));
    const defaultHeaders: Record<string, string> = { ...authHeaders, ...extraHeaders };

    // Step 6 — Construct baseURL
    const sanitizedBase = rawBase.replace(/\/$/, '');
    const routePath = kongRoutePath.trim();
    const normalizedRoute =
      routePath && !routePath.startsWith('/') ? `/${routePath}` : routePath;
    const baseURL = sanitizedBase + normalizedRoute;

    // Step 7 — Instantiate ChatOpenAI and return
    const instance = new ChatOpenAI({
      model,
      streaming,
      temperature,
      ...(maxTokensRaw !== '' && { maxTokens: maxTokensRaw as number }),
      ...(topPRaw !== '' && { topP: topPRaw as number }),
      apiKey: resolvedApiKey,
      configuration: {
        baseURL,
        defaultHeaders,
      },
    });

    return { response: instance };
  }
}
