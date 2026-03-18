"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KongAiGateway = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const openai_1 = require("@langchain/openai");
class KongAiGateway {
    constructor() {
        this.description = {
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
            outputs: [n8n_workflow_1.NodeConnectionTypes.AiLanguageModel],
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
                    description: 'The model name as configured in your Kong AI Gateway route.',
                    required: true,
                },
                {
                    displayName: 'Streaming',
                    name: 'streaming',
                    type: 'boolean',
                    default: true,
                    description: 'Whether to stream token-by-token (true) or wait for the full response (false).',
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
                    description: 'Optional path appended to the base URL, e.g. /openai. A leading slash is added automatically if missing.',
                },
                {
                    displayName: 'Additional Headers',
                    name: 'additionalHeaders',
                    type: 'fixedCollection',
                    typeOptions: { multipleValues: true },
                    default: {},
                    placeholder: 'Add Header',
                    description: 'Extra HTTP headers sent with every request. On key collision, these override credential-level auth headers.',
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
        this.methods = {
            credentialTest: {
                async testKongAiGatewayApiCredential(credential) {
                    var _a, _b;
                    // n8n >= 1.40 requires Node.js >= 18.17, so AbortSignal.timeout() is safe here.
                    const baseUrl = (_b = (_a = credential.data) === null || _a === void 0 ? void 0 : _a.baseUrl) !== null && _b !== void 0 ? _b : '';
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
                    }
                    catch (error) {
                        const msg = error instanceof Error ? error.message : String(error);
                        return {
                            status: 'Error',
                            message: `Could not connect to Kong at ${baseUrl}: ${msg}`,
                        };
                    }
                },
            },
        };
    }
    async supplyData(itemIndex) {
        var _a, _b, _c, _d, _f, _g, _h, _j;
        // Step 1 — Load credentials
        const creds = await this.getCredentials('kongAiGatewayApi');
        const rawBase = creds.baseUrl;
        const authMethod = creds.authMethod;
        // Step 2 — Validate baseUrl
        if (!rawBase || rawBase.trim() === '') {
            throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Kong AI Gateway: baseUrl is required');
        }
        try {
            const parsed = new URL(rawBase);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                throw new Error('unsupported protocol');
            }
        }
        catch (_e) {
            throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Kong AI Gateway: baseUrl must be a valid URL including protocol, e.g. https://kong.example.com');
        }
        // Step 3 — Read node parameters
        const model = this.getNodeParameter('model', itemIndex);
        const streaming = this.getNodeParameter('streaming', itemIndex);
        const temperature = this.getNodeParameter('temperature', itemIndex);
        const maxTokensRaw = this.getNodeParameter('maxTokens', itemIndex, '');
        const topPRaw = this.getNodeParameter('topP', itemIndex, '');
        const kongRoutePath = this.getNodeParameter('kongRoutePath', itemIndex, '');
        const additionalHeadersParam = this.getNodeParameter('additionalHeaders', itemIndex, {});
        // Step 4 — Build authHeaders + resolvedApiKey
        // bearerToken is passed as ChatOpenAI's apiKey so the SDK generates
        // "Authorization: Bearer <token>" natively — avoids a header collision.
        // All other modes use 'kong' as a dummy apiKey (Kong ignores it).
        let authHeaders = {};
        let resolvedApiKey = 'kong';
        switch (authMethod) {
            case 'apiKey': {
                const headerName = ((_a = creds.apiKeyHeader) !== null && _a !== void 0 ? _a : '').trim() || 'apikey';
                const keyValue = (_c = (_b = creds.apiKey) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : '';
                if (!keyValue) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Kong AI Gateway: API Key is required');
                }
                authHeaders = { [headerName]: keyValue };
                break;
            }
            case 'bearerToken': {
                const token = (_f = (_d = creds.bearerToken) === null || _d === void 0 ? void 0 : _d.trim()) !== null && _f !== void 0 ? _f : '';
                if (!token) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Kong AI Gateway: Bearer Token is required');
                }
                resolvedApiKey = token;
                break;
            }
            case 'customHeader': {
                const customName = (_h = (_g = creds.customHeaderName) === null || _g === void 0 ? void 0 : _g.trim()) !== null && _h !== void 0 ? _h : '';
                if (!customName) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Kong AI Gateway: Custom Header Name is required');
                }
                authHeaders = { [customName]: creds.customHeaderValue };
                break;
            }
            // 'none' and default: authHeaders stays {}, resolvedApiKey stays 'kong'
        }
        // Step 5 — Merge additionalHeaders (extra headers win on key collision)
        const rawHeaders = (_j = additionalHeadersParam.headers) !== null && _j !== void 0 ? _j : [];
        const extraHeaders = Object.fromEntries(rawHeaders.map(h => [h.name, h.value]));
        const defaultHeaders = { ...authHeaders, ...extraHeaders };
        // Step 6 — Construct baseURL
        const sanitizedBase = rawBase.replace(/\/$/, '');
        const routePath = kongRoutePath.trim();
        const normalizedRoute = routePath && !routePath.startsWith('/') ? `/${routePath}` : routePath;
        const baseURL = sanitizedBase + normalizedRoute;
        // Step 7 — Instantiate ChatOpenAI and return
        const instance = new openai_1.ChatOpenAI({
            model,
            streaming,
            temperature,
            ...(maxTokensRaw !== '' && { maxTokens: maxTokensRaw }),
            ...(topPRaw !== '' && { topP: topPRaw }),
            apiKey: resolvedApiKey,
            configuration: {
                baseURL,
                defaultHeaders,
            },
        });
        return { response: instance };
    }
}
exports.KongAiGateway = KongAiGateway;
