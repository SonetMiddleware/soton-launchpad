import { api_key, mnemonic } from "../env.json";
import { TonClient, WalletContractV3R2 } from "ton";
import { mnemonicToPrivateKey } from "ton-crypto";

export async function getWallet() {
  let client = new TonClient({
    endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC", apiKey: api_key
  });
  let key = await mnemonicToPrivateKey(mnemonic.split(" "));
  let wallet = await WalletContractV3R2.create({ workchain: 0, publicKey: key.publicKey });
  return { wallet: await client.open(wallet), key: key };
}
