// TODO: possibly use this outside tests

import {Address, beginCell, Cell} from "ton";
import {WrappedSmartContract} from "./wrapped-smart-contract";
import {OPS} from "./ops";

export class JettonWallet extends WrappedSmartContract {
  static transferBody(toOwnerAddress: Address, jettonValue: number, forwardAmount?: bigint): Cell {
    return beginCell()
      .storeUint(OPS.Transfer, 32)
      .storeUint(0, 64) // queryid
      .storeCoins(jettonValue)
      .storeAddress(toOwnerAddress)
      .storeAddress(null) // TODO RESP?
      .storeDict(null) // custom payload
      .storeCoins(forwardAmount ?? 0) // forward ton amount
      .storeMaybeRef(null) // forward payload - TODO??
      .endCell();
  }
}
