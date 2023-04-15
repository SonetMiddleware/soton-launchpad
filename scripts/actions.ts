import { Address, beginCell, Cell, internal, toNano, TonClient } from "ton";
import {
  getAccountJettonBalance,
  getAccountTimeLockAddr,
  getLaunchpadInfo
} from "./read-state";
import { api_key } from "../env.json";
import { getWallet } from "./get-wallet";
import { JettonWallet } from "../test/jetton-lib/jetton-wallet";
import { getJWalletContract } from "../test/jetton-lib/jetton-utils";
import fs from "fs";
import { sleep } from "../test/helpers";

async function claimSoldJetton(launchpadAddr: Address) {
  let { wallet, key } = await getWallet();
  const account = wallet.address;
  const launchpadState = await getLaunchpadInfo(launchpadAddr);
  if (Date.now() / 1000 < launchpadState.releaseTime) {
    throw new Error("not end");
  }
  const accountTimeLock = await getAccountTimeLockAddr(account, launchpadState.releaseTime);
  let client = new TonClient({
    endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC", apiKey: api_key
  });
  console.log("time lock address is", accountTimeLock.toString());
  let states = await client.getContractState(accountTimeLock);
  if (!states.code || !states.data) {
    // deploy time lock address
    console.log("deploy time lock by self...");
    let seq = await wallet.getSeqno();
    let timelockCode = Cell.fromBoc(fs.readFileSync("../build/timelock.cell"))[0];
    let dataCell = beginCell().storeUint(launchpadState.releaseTime, 64).storeAddress(account).endCell();
    const deploy = await wallet.createTransfer({
      seqno: seq, messages: [
        internal({
          to: accountTimeLock, // invoke time lock to release
          value: toNano("0.1"),
          init: { code: timelockCode, data: dataCell }
        })
      ], secretKey: key.secretKey
    });
    await wallet.send(deploy);
    for (; ;) {
      await sleep(2000);
      let curSeq = await wallet.getSeqno();
      if (curSeq > seq) {
        break;
      }
    }
    // throw new Error('time lock not deployed');
  }
  const accountTimeLockSoldJettonWallet = await getJWalletContract(accountTimeLock, launchpadState.soldJetton);
  // SOLD jetton stored at timeLock contract before release time
  const purchasedAmount = await getAccountJettonBalance(accountTimeLock, launchpadState.soldJetton);
  console.log("purchased amount is", purchasedAmount);
  const transfer = await wallet.createTransfer({
    seqno: await wallet.getSeqno(), messages: [
      internal({
        to: accountTimeLock, // invoke time lock to release
        value: toNano("0.1"),
        body: beginCell().storeAddress(accountTimeLockSoldJettonWallet.address) // let time lock to invoke account time lock sold jetton wallet to release jetton
          .storeRef(JettonWallet.transferBody(account, purchasedAmount)).endCell()
      })
    ], secretKey: key.secretKey
  });
  await wallet.send(transfer);
}


async function ownerClaimSourceJettonOrTon(launchpadAddr: Address) {
  let { wallet, key } = await getWallet();
  const launchpadState = await getLaunchpadInfo(launchpadAddr);
  console.log("receive source is", launchpadState.received);
  const transfer = await wallet.createTransfer({
    seqno: await wallet.getSeqno(), messages: [
      internal({
        to: launchpadAddr,
        value: toNano("0.1"),
        body: beginCell()
          .storeUint(1, 32) // op
          .storeUint(0, 64) // query id
          .endCell()
      })
    ], secretKey: key.secretKey
  });
  await wallet.send(transfer);
}

async function ownerClaimUnsoldJetton(launchpadAddr: Address) {
  let { wallet, key } = await getWallet();
  const launchpadState = await getLaunchpadInfo(launchpadAddr);
  const launchpadSoldJettonWalletBalance = await getAccountJettonBalance(launchpadAddr, launchpadState.soldJetton);
  console.log("unsold jetton is", launchpadSoldJettonWalletBalance);
  const transfer = await wallet.createTransfer({
    seqno: await wallet.getSeqno(), messages: [
      internal({
        to: launchpadAddr,
        value: toNano("0.1"),
        body: beginCell()
          .storeUint(2, 32) // op
          .storeUint(0, 64) // query id
          .storeUint(launchpadSoldJettonWalletBalance, 64)
          .endCell()
      })
    ], secretKey: key.secretKey
  });
  await wallet.send(transfer);
}

// ownerClaimSourceJettonOrTon(Address.parse("EQDSMVdOmOBZVKcNNJVXy0mH2H6apOGirrfU2gVNyp8Wwo3a")).then(() => process.exit(0)).catch(e => {
//   console.log(e);
//   process.exit(1);
// });
