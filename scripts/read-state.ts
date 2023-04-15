import { Address, beginCell, Cell, contractAddress, Slice, TonClient } from "ton";
import { getJWalletContract, parseJettonWalletDetails } from "../test/jetton-lib/jetton-utils";
import fs from "fs";
import { api_key } from "../env.json";
import { WrappedSmartContract } from "../test/jetton-lib/wrapped-smart-contract";

export function getAccountTimeLockAddr(account: Address, endTime: number | bigint) {
  let timelockCode = Cell.fromBoc(fs.readFileSync("../build/timelock.cell"))[0];
  let dataCell = beginCell().storeUint(endTime, 64).storeAddress(account).endCell();
  return contractAddress(0, { code: timelockCode, data: dataCell });
}

export async function getAccountJettonBalance(account: Address, jetton: Address) {
  let client = new TonClient({
    endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC", apiKey: api_key
  });
  const jWalletInit = await getJWalletContract(account, jetton);
  console.log("jWalletInit", jWalletInit.address.toString());
  let states = await client.getContractState(jWalletInit.address);
  if (!states.code || !states.data) {
    throw new Error("ill contract");
  }
  let jWalletCurrent = await WrappedSmartContract.create(Cell.fromBoc(states.code)[0], Cell.fromBoc(states.data)[0]);
  const { balance } = parseJettonWalletDetails(
    await jWalletCurrent.contract.invokeGetMethod("get_wallet_data", [])
  );
  return balance;
}

export async function getLaunchpadInfo(launchpadAddr: Address) {
  let client = new TonClient({
    endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC", apiKey: api_key
  });
  let states = await client.getContractState(launchpadAddr);
  if (!states.code || !states.data) {
    throw new Error("ill contract");
  }
  let launchpad = await WrappedSmartContract.create(Cell.fromBoc(states.code)[0], Cell.fromBoc(states.data)[0]);
  const launchpadData = await launchpad.contract.invokeGetMethod("get_info", []);
  return {
    releaseTime: launchpadData.result[0] as bigint,
    exRate: launchpadData.result[1] as bigint,
    sourceJetton: (launchpadData.result[2] as Slice).remainingBits > 2 ?
      (launchpadData.result[2] as Slice).loadAddress() : null,
    soldJetton: (launchpadData.result[3] as Slice).loadAddress(),
    cap: launchpadData.result[4] as bigint,
    received: launchpadData.result[5] as bigint,
    JETTON_WALLET_CODE: launchpadData.result[6] as Cell,
    timeLockCode: launchpadData.result[7] as Cell,
    owner: (launchpadData.result[8] as Slice).loadAddress()
  };
}

// getAccountJettonBalance(Address.parse("kQDTp1mFvDvJ4xNyzS7Ot1zvtd8xlEy3w1DPGopAJfESCgB5"), Address.parse("kQBajc2rmhof5AR-99pfLmoUlV3Nzcle6P_Mc_KnacsViccN"))
//   .then((balance) => {
//     console.log(balance);
//     process.exit(0);
//   })
//   .catch(e => {
//     console.log(e);
//     process.exit(0);
//   });
