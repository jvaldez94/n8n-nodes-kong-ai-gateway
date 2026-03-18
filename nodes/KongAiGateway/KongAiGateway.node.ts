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
  methods = {
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

  // supplyData stub — implemented in Task 5
  async supplyData(
    this: ISupplyDataFunctions,
    _itemIndex: number,
  ): Promise<SupplyData> {
    throw new NodeOperationError(this.getNode(), 'supplyData: not yet implemented');
  }
}
