"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KongAiGatewayApi = void 0;
class KongAiGatewayApi {
    constructor() {
        this.name = 'kongAiGatewayApi';
        this.displayName = 'Kong AI Gateway API';
        this.documentationUrl = 'https://docs.konghq.com/hub/kong-inc/ai-proxy/';
        this.properties = [
            {
                displayName: 'Base URL',
                name: 'baseUrl',
                type: 'string',
                default: '',
                placeholder: 'https://kong.example.com',
                required: true,
                description: 'Kong Gateway base URL. No trailing slash.',
            },
            {
                displayName: 'Authentication Method',
                name: 'authMethod',
                type: 'options',
                default: 'apiKey',
                required: true,
                options: [
                    { name: 'API Key', value: 'apiKey' },
                    { name: 'Bearer Token', value: 'bearerToken' },
                    { name: 'Custom Header', value: 'customHeader' },
                    { name: 'None', value: 'none' },
                ],
            },
            {
                displayName: 'API Key',
                name: 'apiKey',
                type: 'string',
                typeOptions: { password: true },
                default: '',
                required: true,
                displayOptions: { show: { authMethod: ['apiKey'] } },
            },
            {
                displayName: 'API Key Header Name',
                name: 'apiKeyHeader',
                type: 'string',
                default: 'apikey',
                placeholder: 'apikey',
                displayOptions: { show: { authMethod: ['apiKey'] } },
                description: 'The HTTP header name used to send the API key.',
            },
            {
                displayName: 'Bearer Token',
                name: 'bearerToken',
                type: 'string',
                typeOptions: { password: true },
                default: '',
                required: true,
                displayOptions: { show: { authMethod: ['bearerToken'] } },
            },
            {
                displayName: 'Custom Header Name',
                name: 'customHeaderName',
                type: 'string',
                default: '',
                placeholder: 'X-Kong-Key',
                required: true,
                displayOptions: { show: { authMethod: ['customHeader'] } },
            },
            {
                displayName: 'Custom Header Value',
                name: 'customHeaderValue',
                type: 'string',
                typeOptions: { password: true },
                default: '',
                required: true,
                displayOptions: { show: { authMethod: ['customHeader'] } },
            },
        ];
    }
}
exports.KongAiGatewayApi = KongAiGatewayApi;
