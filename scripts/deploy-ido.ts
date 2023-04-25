import {JETTON_WALLET_CODE} from "../build/jetton-minter.deploy";
import {getWallet} from "./get-wallet";
import {Address, beginCell, Cell, contractAddress, internal, toNano} from "ton";
import fs from "fs";
import {SmartContract} from "ton-contract-executor";
import {WrappedSmartContract} from "../test/jetton-lib/wrapped-smart-contract";

export async function deployLaunchPad(startTime: number, duration: number, cap: number | bigint, owner: Address, exRate: number, soldJetton: Address, sourceJetton?: Address) {
  let {wallet, key} = await getWallet();
  let timelockCode = Cell.fromBoc(fs.readFileSync("../build/timelock.cell"))[0];
  let dataCell =
    beginCell()
      .storeRef(
        beginCell()
          .storeUint(startTime, 64)
          .storeUint(duration, 64)
          .storeUint(exRate, 64)
          .storeUint(cap, 64)
          .storeUint(0, 64)
          .endCell()
      )
      .storeAddress(sourceJetton)
      .storeAddress(soldJetton)
      .storeRef(JETTON_WALLET_CODE)
      .storeRef(timelockCode)
      .storeAddress(owner)
      .endCell();
  let cellFile = sourceJetton ? "../build/ido.cell" : "../build/ton-ido.cell";
  console.log(cellFile);
  let codeCell = Cell.fromBoc(fs.readFileSync(cellFile))[0];
  let init = {code: codeCell, data: dataCell};
  const idoAddr = contractAddress(0, init);
  let transfer = await wallet.createTransfer({
    seqno: await wallet.getSeqno(), messages: [
      internal({
        to: idoAddr,
        value: toNano("0.15"),
        init: init
      })
    ], secretKey: key.secretKey
  });
  await wallet.send(transfer);
  return WrappedSmartContract.create(codeCell, dataCell);
}

