import { Address, beginCell, Cell, Slice, toNano, TonClient } from "ton";
import { api_key } from "../env.json";
import { WrappedSmartContract } from "./jetton-lib/wrapped-smart-contract";
import { internalMessage } from "./helpers";
import { getJWalletContract } from "./jetton-lib/jetton-utils";
import { JettonWallet } from "./jetton-lib/jetton-wallet";

const op_transfer_notification = 0x7362d09c;
describe("test contract at test net", async function() {
  it("init", async () => {
    let client = new TonClient({
      endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC", apiKey: api_key
    });
    let timelockAddr = Address.parse("EQCsfkSBeU5iQDpcVKVdt5gaqGxoZ_JR09TRTXh-Y6u-CT4I");
    let states = await client.getContractState(timelockAddr);
    if (!states.data || !states.code) {
      throw new Error("ill contract");
    }
    let timeLock = await WrappedSmartContract.create(Cell.fromBoc(states.code)[0], Cell.fromBoc(states.data)[0]);
    let timeLockJWallet = await getJWalletContract(timeLock.address, Address.parse("EQAjJTzAyKOHuyTpqcLLgNdTdJcbRfmxm9kNCJvvESADqwHK"));
    let owner = Address.parse("kQCWsaU-piIXzA4MlbcRabYfWJXrjcq-9e9gnwB7pfSz8jdG");
    const res = await timeLock.contract.sendInternalMessage(internalMessage({
      from: owner,
      value: toNano("0.1"),
      body: beginCell().storeAddress(timeLockJWallet.address) // let time lock to invoke account time lock sold jetton wallet to release jetton
        .storeRef(JettonWallet.transferBody(owner, toNano("2"))).endCell()
    }));
    console.log(res.type, res.exit_code, res.actionList);
  });
});
