import type { AssetClass, SymbolIdentity, OptionContract } from "../commonTypes";

export type PositionType = "long" | "short";

export interface Account {
  id: string;
  broker: string;
  name: string;
  currency: string;
  marginEnabled: boolean;
}

export interface EquityPosition {
  id: string;
  accountId: string;
  symbol: SymbolIdentity;
  quantity: number;
  type: PositionType;
  averagePrice: number;
}

export interface OptionPosition {
  id: string;
  accountId: string;
  contract: OptionContract;
  quantity: number;
  type: PositionType;
  averagePrice: number;
}

export type Position = EquityPosition | OptionPosition;

export interface Transaction {
  id: string;
  accountId: string;
  symbol: string;
  assetClass: AssetClass;
  executedAt: string;
  quantity: number;
  price: number;
  side: "buy" | "sell";
  fees: number;
}

export interface MarginProfile {
  accountId: string;
  equity: number;
  marginUsed: number;
  marginAvailable: number;
  maintenanceRequirement: number;
}

export interface RiskLimits {
  maxLeverage: number;
  maxSinglePositionPct: number;
  maxOptionsPct: number;
}

