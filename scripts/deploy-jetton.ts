import { JETTON_MINTER_CODE, jettonMinterInitData } from "../build/jetton-minter.deploy";
import { JettonMinter } from "../test/jetton-lib/jetton-minter";
import { getWallet } from "./get-wallet";
import { Address, internal, toNano } from "ton";

async function deployJetton(name: string, symbol: string) {
  let { wallet, key } = await getWallet();
  let dataCell = jettonMinterInitData(Address.parse("kQBftP02IvpF2Rz6OLk55aQVBeLvi-27JX1xxqOOeWOvX3ro"), {
    name: name,
    symbol: symbol,
    description: "My Long Description".repeat(100)
  }, toNano("10000000"));
  let jetton = (await JettonMinter.create(JETTON_MINTER_CODE, dataCell)) as JettonMinter;
  let transfer = await wallet.createTransfer({
    seqno: await wallet.getSeqno(), messages: [
      internal({ to: jetton.address, value: toNano("0.01"), init: { code: JETTON_MINTER_CODE, data: dataCell } })
    ], secretKey: key.secretKey
  });
  await wallet.send(transfer);
  console.log(wallet.address.toString(), jetton.address.toString());
}

deployJetton("Source Jetton", "SOURCE").then(() => process.exit(0)).catch(e => console.log(e));
