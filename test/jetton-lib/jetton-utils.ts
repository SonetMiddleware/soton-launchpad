import BN from "bn.js";
import {Address, Slice} from "ton";
import {JettonMetaDataKeys} from "../../build/jetton-minter.deploy";

interface JettonDetails {
  totalSupply: BN;
  address: Address;
  metadata: { [s in JettonMetaDataKeys]?: string };
}

export function parseJettonDetails(execResult: { result: any[] }): JettonDetails {
  return {
    totalSupply: execResult.result[0] as BN,
    address: (execResult.result[2] as Slice).loadAddress() as Address,
    metadata: {},
  };
}

export function getWalletAddress(stack: any[]): Address {
  return stack[0][1].bytes[0].beginParse().readAddress()!;
}

interface JettonWalletDetails {
  balance: bigint;
  owner: Address;
  jettonMasterContract: Address; // Minter
}

export function parseJettonWalletDetails(execResult: { result: any[] }): JettonWalletDetails {
  return {
    balance: execResult.result[0] as bigint,
    owner: (execResult.result[1] as Slice).loadAddress()!,
    jettonMasterContract: (execResult.result[2] as Slice).loadAddress()!,
  };
}
