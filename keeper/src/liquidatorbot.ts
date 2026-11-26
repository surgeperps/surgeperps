import { getTipAccounts } from "./lib";

export async function liquidatorBot() {
  // Implement the liquidator bot logic here
  // Why tip
  const tipAccounts = await getTipAccounts();
  console.log("Tip Accounts:", tipAccounts);
}
