export const STUDIONET = {
  chainId: "0xf22f",
  chainName: "GenLayer Studionet",
  nativeCurrency: {
    name: "GEN",
    symbol: "GEN",
    decimals: 18,
  },
  rpcUrls: ["https://studio.genlayer.com/api"],
  blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
};

export async function switchToStudionet(provider) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIONET.chainId }],
    });
  } catch (error) {
    if (error.code !== 4902) {
      throw error;
    }
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [STUDIONET],
    });
  }
}

export async function requestAccountPicker(provider) {
  try {
    await provider.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch (error) {
    if (error?.code !== -32601 && error?.code !== -32004) {
      throw error;
    }
  }
}

export async function revokeAccountPermission(provider) {
  try {
    await provider.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch (error) {
    if (error?.code !== -32601 && error?.code !== -32004) {
      throw error;
    }
  }
}

export function readableWalletError(error) {
  if (error?.code === 4001) {
    return "Wallet request was rejected.";
  }
  return error?.message || "Wallet could not connect to GenLayer Studionet.";
}
