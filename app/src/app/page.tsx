// Why: the index has to be public and checkable. Anyone should be able to see
//      the current value and its history before trusting a market on it (step 7).
// How: will read the combined index and both sub-indices (priority fees, Jito tips)
//      from the oracle program and chart them. Placeholder for now.

export default function IndexPage() {
  return (
    <main>
      <h1>Surge Index</h1>
      <p>What Solana users pay for blockspace: priority fees and Jito tips.</p>
      <p>Live index coming soon.</p>
    </main>
  );
}
