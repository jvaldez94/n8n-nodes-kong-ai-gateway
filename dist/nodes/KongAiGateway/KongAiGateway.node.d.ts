import type { INodeType, INodeTypeDescription, ISupplyDataFunctions, SupplyData } from 'n8n-workflow';
export declare class KongAiGateway implements INodeType {
    description: INodeTypeDescription;
    methods: INodeType['methods'];
    supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData>;
}
