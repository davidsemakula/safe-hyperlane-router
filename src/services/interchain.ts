import * as ethers from 'ethers';
import { ChainNameToDomainId, hyperlaneCoreAddresses } from '@hyperlane-xyz/sdk';
import { BaseTransaction } from '@gnosis.pm/safe-apps-sdk';

import { allChains, ChainName, ChainType, getChainInfoByName, SimpleChainInfo } from '../utils/chains';

const SUPPORTED_CHAINS: Array<string> = [
  // Testnet
  ChainName.alfajores,
  ChainName.arbitrumgoerli,
  ChainName.bsctestnet,
  ChainName.fuji,
  ChainName.goerli,
  ChainName.moonbasealpha,
  ChainName.mumbai,
  ChainName.optimism,
  // Mainnet
  ChainName.arbitrum,
  ChainName.avalanche,
  ChainName.bsc,
  ChainName.celo,
  ChainName.ethereum,
  ChainName.optimism,
  ChainName.moonbeam,
  ChainName.polygon,
];

export const getSupportedChains = (): Array<SimpleChainInfo> => {
  return allChains.filter((chain) => SUPPORTED_CHAINS.includes(chain.name));
};

export const getDefaultRemoteChain = (origin?: string): string => {
  if (origin) {
    const originType = getChainInfoByName(origin)?.type;
    if (originType === ChainType.TESTNET) {
      return origin !== ChainName.goerli ? ChainName.goerli : ChainName.mumbai;
    }
    return origin !== ChainName.ethereum ? ChainName.ethereum : ChainName.polygon;
  }
  return '';
};

const getRouterAddress = (origin: string): string => {
  return hyperlaneCoreAddresses[origin]?.interchainAccountRouter;
};

export const getInterchainAccountAddress = async (
  origin: string,
  remote: string,
  originAddress: string,
): Promise<string> => {
  const remoteInfo = getChainInfoByName(remote);
  const originDomain = ChainNameToDomainId[origin];
  const accountRouterAddress = getRouterAddress(origin);

  if (remoteInfo?.rpcUrl) {
    const accountRouterContract = new ethers.Contract(
      accountRouterAddress,
      ['function getInterchainAccount(uint32 _originDomain, address _sender) external view returns (address)'],
      new ethers.providers.JsonRpcProvider(remoteInfo.rpcUrl as string),
    );
    try {
      const address = await accountRouterContract.getInterchainAccount(originDomain, originAddress);
      if (address) {
        return address;
      }
    } catch (e) {
      console.error('interchainAccountAddress:error:', e);
    }
  }
  return '';
};

export const isTransactionSupported = (tx: BaseTransaction): boolean => {
  return ['0', 0, null, undefined].includes(tx.value);
};

export const isTransactionBatchSupported = (txs: Array<BaseTransaction>): boolean => {
  return txs.filter((tx) => !isTransactionSupported(tx)).length === 0;
};

export const translateTransactions = (
  origin: string,
  remote: string,
  txs: Array<BaseTransaction>,
): Array<BaseTransaction> => {
  const routerAddress = getRouterAddress(origin);
  const destinationDomain = ChainNameToDomainId[remote];

  const routerInterface = new ethers.utils.Interface([
    'function dispatch(uint32 _destinationDomain, tuple(address to, bytes data)[] calldata calls) external returns (bytes32)',
  ]);

  return [
    {
      to: routerAddress,
      value: '0',
      data: routerInterface.encodeFunctionData('dispatch', [
        destinationDomain,
        txs.map((tx) => ({
          to: tx.to,
          // TODO: @david value is not handled because Hyperlane InterchainAccounts don't handle value calls
          data: tx.data,
        })),
      ]),
    },
  ];
};

export const getOriginExplorerUrl = (origin: string, txHash: string) => {
  const chain = getChainInfoByName(origin);
  if (chain?.blockExplorerUrl) {
    return `${chain.blockExplorerUrl}${/\/$/.test(chain.blockExplorerUrl) ? '' : '/'}tx/${txHash}`;
  }
  return '';
};

export const getInterchainExplorerUrl = (origin: string, remote: string, txHash: string) => {
  return txHash ? `https://explorer.hyperlane.xyz/?search=${txHash}` || getOriginExplorerUrl(origin, txHash) : '';
};
