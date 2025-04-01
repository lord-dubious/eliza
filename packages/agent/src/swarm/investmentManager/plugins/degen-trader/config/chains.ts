export const CHAIN_CONFIG = {
  SOLANA_ENABLED: false,
  BASE_ENABLED: true,
};

export const BASE_CONFIG = {
  RPC_URL: process.env.EVM_PROVIDER_URL || "https://mainnet.base.org",
  ROUTER_ADDRESS: "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86",
  WETH_ADDRESS: "0x4200000000000000000000000000000000000006",
  CHAIN_ID: 8453,
  AERODROME: {
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    USDT: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
  },
}; 